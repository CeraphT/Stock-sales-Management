using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record RefundResponse(Guid SaleId, SaleStatus Status, decimal RefundedAmount);

/// <summary>Full-refund-only tool (no partial/line-level refund) — reverses
/// stock, payment-method balances (Credit/GiftCard/StoreCredit), and loyalty
/// points earned for a Completed sale, then marks it Refunded. Deliberately
/// out of scope: partial refunds, re-selling returned stock at a different
/// price, refund reason tracking — a Completed sale is otherwise an
/// immutable financial record (see SaleEndpoints' delete-only-if-Held note).</summary>
public static class RefundEndpoints
{
    public static void MapRefundEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/sales/{saleId:guid}/refund", async (
            Guid companyId, Guid saleId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var callerUserId = http.User.GetUserId();
            if (callerUserId is null)
                return Results.Unauthorized();

            var sale = await db.Sales
                .Include(s => s.ProductLines)
                .Include(s => s.ServiceLines).ThenInclude(l => l.Service).ThenInclude(sv => sv!.StockLinks)
                .Include(s => s.PaymentSplits)
                .FirstOrDefaultAsync(s => s.Id == saleId && s.CompanyId == companyId);

            if (sale is null)
                return Results.NotFound(new { message = "Vente introuvable." });

            if (sale.Status != SaleStatus.Completed)
                return Results.BadRequest(new { message = $"Seule une vente terminée peut être remboursée (statut actuel : {sale.Status})." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            await using var transaction = await db.Database.BeginTransactionAsync();
            try
            {
                // --- Stock reversal: product lines --------------------------------
                // Each SaleLine already carries the exact BatchId it was deducted
                // from (FEFO can split one product line across several batches, so
                // this is precise — no guessing which batch to credit back).
                foreach (var line in sale.ProductLines)
                {
                    if (line.BatchId is not { } batchId)
                        continue; // held sales resumed then refunded shouldn't have null BatchId, but guard anyway

                    var batch = await db.Batches.FindAsync(batchId);
                    if (batch is not null)
                        batch.QuantityInBaseUnits += line.QuantityInBaseUnits;

                    db.StockMovements.Add(new StockMovement
                    {
                        ProductId = line.ProductId,
                        BatchId = batchId,
                        LocationId = sale.LocationId,
                        Type = StockMovementType.Return,
                        QuantityInBaseUnits = line.QuantityInBaseUnits,
                        UserId = callerUserId.Value,
                    });
                }

                // --- Stock reversal: service-linked consumption --------------------
                // ServiceLine (unlike SaleLine) doesn't record which batch(es) its
                // stock-link consumption actually drew from — StockMovement has no
                // SaleId to trace it back exactly either, and adding one is a schema
                // change out of scope for this full-refund-only tool. Simplest
                // defensible policy: credit the full consumed quantity back to
                // whichever batch of that product/location is soonest to expire
                // (mirrors DeductFefoAsync's own ordering), same as where a real
                // FEFO deduction would have preferred to pull from anyway.
                foreach (var serviceLine in sale.ServiceLines)
                {
                    var service = serviceLine.Service;
                    if (service is null)
                        continue;

                    foreach (var stockLink in service.StockLinks)
                    {
                        var totalConsumed = stockLink.QuantityConsumedInBaseUnits * serviceLine.Quantity;
                        if (totalConsumed <= 0)
                            continue;

                        var batch = await db.Batches
                            .Where(b => b.ProductId == stockLink.ProductId && b.LocationId == sale.LocationId)
                            .OrderBy(b => b.ExpiryDate == null ? 1 : 0)
                            .ThenBy(b => b.ExpiryDate)
                            .FirstOrDefaultAsync();

                        if (batch is null)
                            continue; // no batch ever existed for this product/location — nothing sensible to credit

                        batch.QuantityInBaseUnits += totalConsumed;

                        db.StockMovements.Add(new StockMovement
                        {
                            ProductId = stockLink.ProductId,
                            BatchId = batch.Id,
                            LocationId = sale.LocationId,
                            Type = StockMovementType.Return,
                            QuantityInBaseUnits = totalConsumed,
                            UserId = callerUserId.Value,
                        });
                    }
                }

                // --- Payment-method balance reversal --------------------------------
                // Same per-method amount computation as SaleEndpoints' forward path:
                // prefer PaymentSplits legs when present, else the whole sale.Total
                // when PaymentMethod matches directly.
                var creditAmount = sale.PaymentSplits.Count > 0
                    ? sale.PaymentSplits.Where(s => s.Method == PaymentMethod.Credit).Sum(s => s.Amount)
                    : (sale.PaymentMethod == PaymentMethod.Credit ? sale.Total : 0m);
                if (creditAmount > 0 && sale.CustomerId is not null)
                {
                    var customer = await db.Customers.FindAsync(sale.CustomerId.Value);
                    if (customer is not null)
                        customer.CreditBalance -= creditAmount;
                }

                var giftCardAmount = sale.PaymentSplits.Count > 0
                    ? sale.PaymentSplits.Where(s => s.Method == PaymentMethod.GiftCard).Sum(s => s.Amount)
                    : (sale.PaymentMethod == PaymentMethod.GiftCard ? sale.Total : 0m);
                if (giftCardAmount > 0 && !string.IsNullOrWhiteSpace(sale.GiftCardCode))
                {
                    var giftCard = await db.GiftCards.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.Code == sale.GiftCardCode);
                    if (giftCard is not null)
                        giftCard.RemainingValue = Math.Min(giftCard.InitialValue, giftCard.RemainingValue + giftCardAmount);
                }

                var storeCreditAmount = sale.PaymentSplits.Count > 0
                    ? sale.PaymentSplits.Where(s => s.Method == PaymentMethod.StoreCredit).Sum(s => s.Amount)
                    : (sale.PaymentMethod == PaymentMethod.StoreCredit ? sale.Total : 0m);
                if (storeCreditAmount > 0 && sale.CustomerId is not null)
                {
                    var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == sale.CustomerId);
                    if (loyaltyAccount is not null)
                        loyaltyAccount.StoreCreditBalance += storeCreditAmount;
                }

                // --- Loyalty points earned reversal ---------------------------------
                if (company.LoyaltyEnabled && sale.CustomerId is not null && sale.Total > 0)
                {
                    var pointsEarned = (int)Math.Floor(sale.Total / company.LoyaltyEarnRateAmount);
                    if (pointsEarned > 0)
                    {
                        var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == sale.CustomerId);
                        if (loyaltyAccount is not null)
                            loyaltyAccount.PointsBalance = Math.Max(0, loyaltyAccount.PointsBalance - pointsEarned);
                    }
                }

                sale.Status = SaleStatus.Refunded;

                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Results.Ok(new RefundResponse(sale.Id, sale.Status, sale.Total));
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }
}
