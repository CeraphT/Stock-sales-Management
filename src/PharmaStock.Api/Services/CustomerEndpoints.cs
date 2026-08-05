using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record CustomerRequest(string Name, string? Phone, bool IsBusiness = false, string? TaxId = null);
public record CustomerResponse(Guid Id, string Name, string? Phone, decimal CreditBalance, int LoyaltyPointsBalance, decimal LoyaltyStoreCreditBalance, int RewardsGranted, bool IsBusiness, string? TaxId);

// One credit-affecting sale for the per-customer statement: how much of it went
// on account (Credit → adds to what they owe) and/or was paid from store credit.
public record CustomerCreditEntry(Guid SaleId, DateTime Timestamp, decimal Total, SaleStatus Status, decimal CreditAmount, decimal StoreCreditAmount, string Items);
public record CustomerCreditHistoryResponse(decimal CreditBalance, decimal StoreCreditBalance, List<CustomerCreditEntry> Entries);

/// <summary>Section 3.5/21.3 — customer records, the prerequisite every
/// Credit/StoreCredit/loyalty-points sale needs (Sale.CustomerId already
/// existed; nothing could attach one to a sale until this existed). List/
/// create only — no delete, since a customer accumulates real financial
/// history (CreditBalance, LoyaltyAccount) that must never be silently
/// discarded the way a Supplier (no history of its own) can be.</summary>
public static class CustomerEndpoints
{
    public static void MapCustomerEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/customers").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, string? search, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.Customers.Where(c => c.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(c => EF.Functions.ILike(c.Name, $"%{search}%") || (c.Phone != null && EF.Functions.ILike(c.Phone, $"%{search}%")));

            var customers = await query
                .Include(c => c.LoyaltyAccount)
                .OrderBy(c => c.Name)
                .Select(c => new CustomerResponse(
                    c.Id, c.Name, c.Phone, c.CreditBalance,
                    c.LoyaltyAccount != null ? c.LoyaltyAccount.PointsBalance : 0,
                    c.LoyaltyAccount != null ? c.LoyaltyAccount.StoreCreditBalance : 0,
                    c.RewardsGranted, c.IsBusiness, c.TaxId))
                .ToListAsync();

            return Results.Ok(customers);
        });

        group.MapPost("/", async (Guid companyId, CustomerRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCustomers);
            if (restricted is not null) return restricted;

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du client est requis." });

            var customer = new Customer
            {
                CompanyId = companyId,
                Name = request.Name.Trim(),
                Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
                IsBusiness = request.IsBusiness,
                TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim(),
            };
            db.Customers.Add(customer);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/customers/{customer.Id}",
                new CustomerResponse(customer.Id, customer.Name, customer.Phone, customer.CreditBalance, 0, 0, 0, customer.IsBusiness, customer.TaxId));
        });

        // Per-customer credit statement — the sales that make up what a customer
        // owes (Credit payment splits) and any store credit they spent
        // (StoreCredit splits), newest first, each with what was bought and
        // whether it was later refunded. There's no separate credit-ledger table;
        // the balance is these sales (plus refunds), so this reconstructs it.
        group.MapGet("/{customerId:guid}/credit-history", async (Guid companyId, Guid customerId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var customer = await db.Customers
                .Include(c => c.LoyaltyAccount)
                .FirstOrDefaultAsync(c => c.Id == customerId && c.CompanyId == companyId);
            if (customer is null)
                return Results.NotFound();

            var sales = await db.Sales
                .Where(s => s.CompanyId == companyId && s.CustomerId == customerId)
                .Include(s => s.PaymentSplits)
                .OrderByDescending(s => s.Timestamp)
                .ToListAsync();

            // Mirror SaleEndpoints' payment derivation exactly: a split payment
            // records per-method PaymentSplit rows, but a single-method sale has
            // NO splits — the whole total is the sale's PaymentMethod. So fall
            // back to PaymentMethod when a sale has no splits (the common case —
            // most sales aren't split), else the endpoint would miss every
            // whole-credit / whole-store-credit sale.
            var credit = sales
                .Select(s =>
                {
                    var hasSplits = s.PaymentSplits.Count > 0;
                    var creditAmount = hasSplits
                        ? s.PaymentSplits.Where(p => p.Method == PaymentMethod.Credit).Sum(p => p.Amount)
                        : (s.PaymentMethod == PaymentMethod.Credit ? s.Total : 0m);
                    var storeCreditAmount = hasSplits
                        ? s.PaymentSplits.Where(p => p.Method == PaymentMethod.StoreCredit).Sum(p => p.Amount)
                        : (s.PaymentMethod == PaymentMethod.StoreCredit ? s.Total : 0m);
                    return new { Sale = s, CreditAmount = creditAmount, StoreCreditAmount = storeCreditAmount };
                })
                .Where(x => x.CreditAmount != 0 || x.StoreCreditAmount != 0)
                .ToList();

            var saleIds = credit.Select(x => x.Sale.Id).ToList();
            var lineRows = await db.SaleLines
                .Where(l => saleIds.Contains(l.SaleId))
                .Select(l => new { l.SaleId, Name = l.Product!.Name, Qty = l.QuantityInBaseUnits })
                .ToListAsync();
            var itemsBySale = lineRows
                .GroupBy(l => l.SaleId)
                .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(l => $"{l.Qty}× {l.Name}")));

            var entries = credit
                .Select(x => new CustomerCreditEntry(
                    x.Sale.Id, x.Sale.Timestamp, x.Sale.Total, x.Sale.Status,
                    x.CreditAmount, x.StoreCreditAmount,
                    itemsBySale.TryGetValue(x.Sale.Id, out var it) ? it : ""))
                .ToList();

            return Results.Ok(new CustomerCreditHistoryResponse(
                customer.CreditBalance,
                customer.LoyaltyAccount?.StoreCreditBalance ?? 0,
                entries));
        });
    }
}
