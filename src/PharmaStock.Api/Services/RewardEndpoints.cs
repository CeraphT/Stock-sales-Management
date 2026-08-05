using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record RewardStatusResponse(
    bool Enabled, int PurchaseCount, int Threshold, decimal RewardValue,
    int RewardsEarned, int RewardsGranted, int RewardsDue, int PurchasesUntilNext);

/// <summary>Purchase-milestone reward program (see Company.RewardProgramEnabled).
/// A customer earns one bearer gift card each time their completed-purchase
/// count crosses a multiple of Company.RewardPurchaseCount. This is deliberately
/// separate from loyalty points: the reward is a physical, printable gift card
/// the cashier hands over so the customer brings the code back next visit.</summary>
public static class RewardEndpoints
{
    public static void MapRewardEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/customers/{customerId:guid}/reward").RequireAuthorization();

        // How far along the milestone this customer is — drives the POS banner.
        group.MapGet("/status", async (Guid companyId, Guid customerId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.CompanyId == companyId);
            if (customer is null)
                return Results.NotFound(new { message = "Client introuvable." });

            var threshold = company.RewardPurchaseCount > 0 ? company.RewardPurchaseCount : 1;
            var purchaseCount = await db.Sales.CountAsync(s =>
                s.CompanyId == companyId && s.CustomerId == customerId && s.Status == SaleStatus.Completed);

            var earned = purchaseCount / threshold;
            var due = Math.Max(0, earned - customer.RewardsGranted);
            var untilNext = threshold - (purchaseCount % threshold);
            if (untilNext == threshold) untilNext = 0; // sitting exactly on a milestone

            return Results.Ok(new RewardStatusResponse(
                company.RewardProgramEnabled, purchaseCount, threshold, company.RewardGiftCardValue,
                earned, customer.RewardsGranted, due, untilNext));
        });

        // Issue one reward gift card the customer is owed. Idempotent against
        // double-clicks only in the sense that it re-checks "due" each call —
        // once RewardsGranted catches up to earned, further calls 400.
        group.MapPost("/issue", async (Guid companyId, Guid customerId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCustomers);
            if (restricted is not null) return restricted;

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });
            if (!company.RewardProgramEnabled)
                return Results.BadRequest(new { message = "Le programme de récompenses est désactivé." });
            if (company.RewardGiftCardValue <= 0)
                return Results.BadRequest(new { message = "La valeur de la carte de récompense doit être positive." });

            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.CompanyId == companyId);
            if (customer is null)
                return Results.NotFound(new { message = "Client introuvable." });

            var threshold = company.RewardPurchaseCount > 0 ? company.RewardPurchaseCount : 1;
            var purchaseCount = await db.Sales.CountAsync(s =>
                s.CompanyId == companyId && s.CustomerId == customerId && s.Status == SaleStatus.Completed);
            var due = (purchaseCount / threshold) - customer.RewardsGranted;
            if (due <= 0)
                return Results.BadRequest(new { message = "Ce client n'a pas de récompense à réclamer." });

            string code;
            var attempts = 0;
            do
            {
                code = GenerateCode();
                attempts++;
            } while (attempts < 5 && await db.GiftCards.AnyAsync(g => g.CompanyId == companyId && g.Code == code));

            var giftCard = new GiftCard
            {
                CompanyId = companyId,
                Code = code,
                InitialValue = company.RewardGiftCardValue,
                RemainingValue = company.RewardGiftCardValue,
            };
            db.GiftCards.Add(giftCard);
            customer.RewardsGranted += 1;
            await db.SaveChangesAsync();

            return Results.Ok(new GiftCardResponse(
                giftCard.Id, giftCard.Code, giftCard.InitialValue, giftCard.RemainingValue, giftCard.Active, giftCard.CreatedAt));
        });
    }

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // same alphabet as GiftCardEndpoints
        var random = Random.Shared;
        var suffix = new string(Enumerable.Range(0, 8).Select(_ => chars[random.Next(chars.Length)]).ToArray());
        return $"GC-{suffix}";
    }
}
