using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record CustomerRequest(string Name, string? Phone);
public record CustomerResponse(Guid Id, string Name, string? Phone, decimal CreditBalance, int LoyaltyPointsBalance, decimal LoyaltyStoreCreditBalance);

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
                    c.LoyaltyAccount != null ? c.LoyaltyAccount.StoreCreditBalance : 0))
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
            };
            db.Customers.Add(customer);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/customers/{customer.Id}",
                new CustomerResponse(customer.Id, customer.Name, customer.Phone, customer.CreditBalance, 0, 0));
        });
    }
}
