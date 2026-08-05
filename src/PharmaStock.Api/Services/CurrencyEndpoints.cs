using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record ConvertCurrencyRequest(string ToCurrency);
public record ConvertCurrencyResponse(
    string FromCurrency, string ToCurrency, decimal Rate,
    int Products, int Batches, int Customers, int GiftCards);

/// <summary>
/// Admin-only, online-only currency conversion. Fetches today's rate from a
/// free public FX API and multiplies every FORWARD-LOOKING money field (product
/// prices, packaging overrides, batch costs, customer credit, loyalty store
/// credit, gift-card values, loyalty config amounts). Historical records —
/// sales, sale lines, payment splits, stock movements, cash-register shifts —
/// are deliberately left in their original currency: a past transaction
/// happened at that value and rewriting it would corrupt the financial history.
/// </summary>
public static class CurrencyEndpoints
{
    public static void MapCurrencyEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/currency/convert", async (
            Guid companyId, ConvertCurrencyRequest request, PharmaStockDbContext db, IHttpClientFactory httpFactory, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var role = http.User.FindFirst(ClaimTypes.Role)?.Value;
            if (role != nameof(UserRole.CompanyAdmin) && role != nameof(UserRole.SuperAdmin))
                return Results.Forbid();

            var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var from = company.Currency.Trim().ToUpperInvariant();
            var to = request.ToCurrency.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(to))
                return Results.BadRequest(new { message = "Devise cible manquante." });
            if (from == to)
                return Results.BadRequest(new { message = "La devise de l'entreprise est déjà celle-ci." });

            // Today's rate (from → to). Free, no-key endpoint.
            decimal rate;
            try
            {
                var client = httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                var json = await client.GetStringAsync($"https://open.er-api.com/v6/latest/{from}");
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.GetProperty("result").GetString() != "success")
                    return Results.BadRequest(new { message = $"Taux de change indisponible pour {from} (code devise non reconnu ?)." });
                if (!root.GetProperty("rates").TryGetProperty(to, out var rateEl))
                    return Results.BadRequest(new { message = $"Aucun taux disponible vers {to}." });
                rate = rateEl.GetDecimal();
            }
            catch
            {
                return Results.BadRequest(new { message = "Impossible de récupérer le taux de change — une connexion internet est requise." });
            }
            if (rate <= 0)
                return Results.BadRequest(new { message = "Taux de change invalide." });

            decimal Conv(decimal v) => Math.Round(v * rate, 2, MidpointRounding.AwayFromZero);

            var products = await db.Products.Where(p => p.CompanyId == companyId).ToListAsync();
            var productIds = products.Select(p => p.Id).ToHashSet();
            foreach (var p in products) { p.PurchasePrice = Conv(p.PurchasePrice); p.SalePrice = Conv(p.SalePrice); }

            var levels = await db.ProductPackagingLevels.Where(l => productIds.Contains(l.ProductId) && l.SalePriceOverride != null).ToListAsync();
            foreach (var l in levels) l.SalePriceOverride = Conv(l.SalePriceOverride!.Value);

            var batches = await db.Batches.Where(b => productIds.Contains(b.ProductId)).ToListAsync();
            foreach (var b in batches) b.PurchasePricePerBaseUnit = Conv(b.PurchasePricePerBaseUnit);

            var customers = await db.Customers.Where(c => c.CompanyId == companyId).ToListAsync();
            var customerIds = customers.Select(c => c.Id).ToHashSet();
            foreach (var c in customers) c.CreditBalance = Conv(c.CreditBalance);

            var loyalty = await db.LoyaltyAccounts.Where(l => customerIds.Contains(l.CustomerId)).ToListAsync();
            foreach (var l in loyalty) l.StoreCreditBalance = Conv(l.StoreCreditBalance);

            var giftCards = await db.GiftCards.Where(g => g.CompanyId == companyId).ToListAsync();
            foreach (var g in giftCards) { g.InitialValue = Conv(g.InitialValue); g.RemainingValue = Conv(g.RemainingValue); }

            company.LoyaltyEarnRateAmount = Conv(company.LoyaltyEarnRateAmount);
            company.LoyaltyPointValue = Conv(company.LoyaltyPointValue);
            company.Currency = to;

            await db.SaveChangesAsync();

            return Results.Ok(new ConvertCurrencyResponse(from, to, rate, products.Count, batches.Count, customers.Count, giftCards.Count));
        }).RequireAuthorization();
    }
}
