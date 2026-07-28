using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record RedeemLoyaltyPointsRequest(int Points);
public record LoyaltyAccountResponse(int PointsBalance, decimal StoreCreditBalance);

/// <summary>Section 21.3 — converting earned loyalty points into spendable
/// StoreCreditBalance. Points are earned automatically as a side effect of
/// every completed sale attributed to a customer (see SaleEndpoints/
/// LocalSalesService — company.LoyaltyEnabled gates it), not through an
/// endpoint here; this file only covers the explicit staff-initiated
/// redeem action, ahead of a sale the customer wants to pay for (in whole
/// or part) with StoreCredit.</summary>
public static class LoyaltyEndpoints
{
    public static void MapLoyaltyEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/customers/{customerId:guid}/loyalty").RequireAuthorization();

        group.MapPost("/redeem", async (Guid companyId, Guid customerId, RedeemLoyaltyPointsRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (request.Points <= 0)
                return Results.BadRequest(new { message = "Le nombre de points doit être positif." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.CompanyId == companyId);
            if (customer is null)
                return Results.NotFound(new { message = "Client introuvable." });

            var loyalty = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == customerId);
            if (loyalty is null || loyalty.PointsBalance < request.Points)
                return Results.BadRequest(new { message = $"Solde de points insuffisant : {loyalty?.PointsBalance ?? 0} disponible(s)." });

            loyalty.PointsBalance -= request.Points;
            loyalty.StoreCreditBalance += request.Points * company.LoyaltyPointValue;
            await db.SaveChangesAsync();

            return Results.Ok(new LoyaltyAccountResponse(loyalty.PointsBalance, loyalty.StoreCreditBalance));
        });
    }
}
