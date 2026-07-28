using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record IssueGiftCardRequest(decimal InitialValue);
public record GiftCardResponse(Guid Id, string Code, decimal InitialValue, decimal RemainingValue, bool Active, DateTime CreatedAt);
public record SetGiftCardActiveRequest(bool Active);

/// <summary>Section 21.3 — issuing and managing prepaid gift cards. Actual
/// redemption (spending a card's balance) happens inside SaleEndpoints/
/// LocalSalesService as part of checkout, not here — this is the
/// "management" side (issue a new card, list what exists, deactivate a
/// lost/stolen one), mirroring SupplierEndpoints' shape.</summary>
public static class GiftCardEndpoints
{
    public static void MapGiftCardEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/giftcards").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, string? search, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.GiftCards.Where(g => g.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(g => EF.Functions.ILike(g.Code, $"%{search}%"));

            var cards = await query
                .OrderByDescending(g => g.CreatedAt)
                .Select(g => new GiftCardResponse(g.Id, g.Code, g.InitialValue, g.RemainingValue, g.Active, g.CreatedAt))
                .ToListAsync();

            return Results.Ok(cards);
        });

        group.MapPost("/", async (Guid companyId, IssueGiftCardRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (request.InitialValue <= 0)
                return Results.BadRequest(new { message = "La valeur initiale doit être positive." });

            // Collision odds are negligible at this scale, same reasoning as
            // Company.UniqueCode — a handful of retries against the unique
            // index below is a cheap, sufficient guarantee.
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
                InitialValue = request.InitialValue,
                RemainingValue = request.InitialValue,
            };
            db.GiftCards.Add(giftCard);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/giftcards/{giftCard.Id}",
                new GiftCardResponse(giftCard.Id, giftCard.Code, giftCard.InitialValue, giftCard.RemainingValue, giftCard.Active, giftCard.CreatedAt));
        });

        // Looked up by code (not id) — the redemption entry point at
        // checkout only ever has the code the customer hands over, never
        // the card's Guid.
        group.MapGet("/lookup/{code}", async (Guid companyId, string code, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var normalized = code.Trim().ToUpperInvariant();
            var card = await db.GiftCards.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.Code == normalized);
            if (card is null)
                return Results.NotFound(new { message = "Carte-cadeau introuvable." });

            return Results.Ok(new GiftCardResponse(card.Id, card.Code, card.InitialValue, card.RemainingValue, card.Active, card.CreatedAt));
        });

        group.MapPut("/{id:guid}/active", async (Guid companyId, Guid id, SetGiftCardActiveRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var card = await db.GiftCards.FirstOrDefaultAsync(g => g.Id == id && g.CompanyId == companyId);
            if (card is null)
                return Results.NotFound(new { message = "Carte-cadeau introuvable." });

            card.Active = request.Active;
            await db.SaveChangesAsync();

            return Results.Ok(new GiftCardResponse(card.Id, card.Code, card.InitialValue, card.RemainingValue, card.Active, card.CreatedAt));
        });
    }

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity, same alphabet as Company.UniqueCode
        var random = Random.Shared;
        var suffix = new string(Enumerable.Range(0, 8).Select(_ => chars[random.Next(chars.Length)]).ToArray());
        return $"GC-{suffix}";
    }
}
