using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record ReceiveStockRequest(
    Guid LocationId, string BatchNumber, DateTime? ExpiryDate,
    int QuantityInBaseUnits, decimal? PurchasePricePerBaseUnit, decimal? VatRatePercent = null,
    // For serial-tracked products: one serial/IMEI per unit received. Ignored for
    // non-serialized products.
    List<string>? SerialNumbers = null);
public record AdjustStockRequest(Guid BatchId, int DeltaInBaseUnits, string Reason);

public record BatchResponse(
    Guid Id, Guid LocationId, string BatchNumber, DateTime? ExpiryDate,
    int QuantityInBaseUnits, decimal PurchasePricePerBaseUnit, DateTime ReceivedAt);
public record StockMovementResponse(
    Guid Id, StockMovementType Type, int QuantityInBaseUnits, string? Reason,
    Guid? BatchId, string? BatchNumber, Guid UserId, string UserName, DateTime Timestamp);
public record SerialResponse(
    Guid Id, string SerialNumber, SerialStatus Status, Guid LocationId,
    string? BatchNumber, DateTime ReceivedAt, DateTime? SoldAt, Guid? SaleId);

public static class StockMovementEndpoints
{
    public static void MapStockMovementEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/products/{productId:guid}").RequireAuthorization();

        // Section 3.3 / 3.4 — receiving a supplier delivery. Always creates a
        // new batch rather than merging into an existing one, even if the
        // batch number repeats: each delivery is its own lot for expiry and
        // FEFO purposes, and merging two lots with different receipt dates
        // would blur which one should be sold first.
        group.MapPost("/stock/receive", async (
            Guid companyId, Guid productId, ReceiveStockRequest request,
            PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            if (request.QuantityInBaseUnits <= 0)
                return Results.BadRequest(new { message = "La quantité doit être positive." });
            if (string.IsNullOrWhiteSpace(request.BatchNumber))
                return Results.BadRequest(new { message = "Le numéro de lot est requis." });

            var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            // Expiry is only mandatory for businesses that actually track it
            // (pharmacy/food) — a butcher or electronics shop receives stock with
            // no expiry at all.
            if (company.ExpiryTrackingEnabled && request.ExpiryDate is null)
                return Results.BadRequest(new { message = "La date d'expiration est requise." });

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });
            if (!product.IsActive)
                return Results.BadRequest(new { message = "Ce produit est archivé et ne peut plus recevoir de stock." });

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            // Serial-tracked products: capture one serial/IMEI per unit. Enforce
            // exactly one serial per base unit, no blanks, no duplicates, and none
            // already sitting in stock for this product.
            List<string> serials = new();
            if (product.SerialTracked)
            {
                serials = (request.SerialNumbers ?? new List<string>())
                    .Select(s => s?.Trim() ?? "")
                    .Where(s => s.Length > 0)
                    .ToList();
                if (serials.Count != request.QuantityInBaseUnits)
                    return Results.BadRequest(new { message = $"Ce produit est suivi par numéro de série : indiquez exactement {request.QuantityInBaseUnits} numéro(s) de série." });
                if (serials.Distinct(StringComparer.OrdinalIgnoreCase).Count() != serials.Count)
                    return Results.BadRequest(new { message = "Des numéros de série en double ont été saisis." });
                var clash = await db.ProductSerials
                    .Where(s => s.CompanyId == companyId && s.ProductId == productId && s.Status == SerialStatus.InStock)
                    .Select(s => s.SerialNumber)
                    .ToListAsync();
                var clashSet = clash.Select(c => c.ToLowerInvariant()).ToHashSet();
                var dup = serials.FirstOrDefault(s => clashSet.Contains(s.ToLowerInvariant()));
                if (dup is not null)
                    return Results.Conflict(new { message = $"Le numéro de série « {dup} » est déjà en stock." });
            }

            var stdVatRate = company.DefaultTaxRatePercent;

            var batch = new Batch
            {
                ProductId = productId,
                LocationId = request.LocationId,
                BatchNumber = request.BatchNumber,
                ExpiryDate = request.ExpiryDate,
                QuantityInBaseUnits = request.QuantityInBaseUnits,
                // Falls back to the catalog's estimated cost if this delivery's
                // actual price isn't given — see Batch.PurchasePricePerBaseUnit.
                PurchasePricePerBaseUnit = request.PurchasePricePerBaseUnit ?? product.PurchasePrice,
                // Input VAT for the tax declaration; defaults to the company's
                // standard rate unless the delivery specifies otherwise.
                PurchaseVatRatePercent = request.VatRatePercent ?? stdVatRate,
            };
            db.Batches.Add(batch);

            db.StockMovements.Add(new StockMovement
            {
                ProductId = productId,
                BatchId = batch.Id,
                LocationId = request.LocationId,
                Type = StockMovementType.Entry,
                QuantityInBaseUnits = request.QuantityInBaseUnits,
                UserId = http.User.GetUserId()!.Value,
            });

            foreach (var sn in serials)
            {
                db.ProductSerials.Add(new ProductSerial
                {
                    CompanyId = companyId,
                    ProductId = productId,
                    LocationId = request.LocationId,
                    BatchId = batch.Id,
                    SerialNumber = sn,
                    Status = SerialStatus.InStock,
                });
            }

            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/products/{productId}/batches/{batch.Id}",
                new BatchResponse(batch.Id, batch.LocationId, batch.BatchNumber, batch.ExpiryDate,
                    batch.QuantityInBaseUnits, batch.PurchasePricePerBaseUnit, batch.ReceivedAt));
        });

        // Section 3.3 — manual adjustment (breakage, theft, expiry write-off,
        // physical-inventory correction). Reason is mandatory: an adjustment
        // with no explanation defeats the traceability this exists for.
        group.MapPost("/stock/adjust", async (
            Guid companyId, Guid productId, AdjustStockRequest request,
            PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            if (request.DeltaInBaseUnits == 0)
                return Results.BadRequest(new { message = "La variation doit être différente de zéro." });
            if (string.IsNullOrWhiteSpace(request.Reason))
                return Results.BadRequest(new { message = "Un motif est requis pour un ajustement manuel." });

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });
            if (!product.IsActive)
                return Results.BadRequest(new { message = "Ce produit est archivé et ne peut plus être ajusté." });

            await using var transaction = await db.Database.BeginTransactionAsync();

            var batch = await db.Batches
                .FromSqlInterpolated($@"SELECT * FROM ""Batches"" WHERE ""Id"" = {request.BatchId} FOR UPDATE")
                .FirstOrDefaultAsync();
            if (batch is null || batch.ProductId != productId)
                return Results.NotFound(new { message = "Lot introuvable pour ce produit." });

            var newBalance = batch.QuantityInBaseUnits + request.DeltaInBaseUnits;
            if (newBalance < 0)
            {
                await transaction.RollbackAsync();
                return Results.Conflict(new
                {
                    message = $"Cet ajustement rendrait le solde du lot négatif " +
                        $"({batch.QuantityInBaseUnits} + {request.DeltaInBaseUnits})."
                });
            }

            batch.QuantityInBaseUnits = newBalance;
            db.StockMovements.Add(new StockMovement
            {
                ProductId = productId,
                BatchId = batch.Id,
                LocationId = batch.LocationId,
                Type = StockMovementType.Adjustment,
                QuantityInBaseUnits = request.DeltaInBaseUnits,
                Reason = request.Reason,
                UserId = http.User.GetUserId()!.Value,
            });

            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            return Results.Ok(new BatchResponse(batch.Id, batch.LocationId, batch.BatchNumber, batch.ExpiryDate,
                batch.QuantityInBaseUnits, batch.PurchasePricePerBaseUnit, batch.ReceivedAt));
        });

        // Section 3.3 — per-product, per-batch quantity view.
        group.MapGet("/batches", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            var productExists = await db.Products.AnyAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (!productExists)
                return Results.NotFound(new { message = "Produit introuvable." });

            var batches = await db.Batches
                .Where(b => b.ProductId == productId)
                .OrderBy(b => b.ExpiryDate)
                .Select(b => new BatchResponse(b.Id, b.LocationId, b.BatchNumber, b.ExpiryDate,
                    b.QuantityInBaseUnits, b.PurchasePricePerBaseUnit, b.ReceivedAt))
                .ToListAsync();

            return Results.Ok(batches);
        });

        // Section 3.3 — complete timestamped movement history for a product.
        group.MapGet("/movements", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            var productExists = await db.Products.AnyAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (!productExists)
                return Results.NotFound(new { message = "Produit introuvable." });

            var movements = await db.StockMovements
                .Where(m => m.ProductId == productId)
                .Include(m => m.Batch)
                .Include(m => m.User)
                .OrderByDescending(m => m.Timestamp)
                .Select(m => new StockMovementResponse(
                    m.Id, m.Type, m.QuantityInBaseUnits, m.Reason,
                    m.BatchId, m.Batch != null ? m.Batch.BatchNumber : null,
                    m.UserId, m.User != null ? m.User.Name : string.Empty, m.Timestamp))
                .ToListAsync();

            return Results.Ok(movements);
        });

        // Serial/IMEI registry for a product. Optional filters: status (int enum
        // value — 0 InStock, 1 Sold, 2 Returned) and locationId. The POS serial
        // picker calls this with status=0 & the current location; a management
        // "Serials" view calls it unfiltered.
        group.MapGet("/serials", async (
            Guid companyId, Guid productId, int? status, Guid? locationId,
            PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            var productExists = await db.Products.AnyAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (!productExists)
                return Results.NotFound(new { message = "Produit introuvable." });

            var query = db.ProductSerials.Where(s => s.CompanyId == companyId && s.ProductId == productId);
            if (status is not null) query = query.Where(s => (int)s.Status == status);
            if (locationId is not null) query = query.Where(s => s.LocationId == locationId);

            var serials = await query
                .OrderByDescending(s => s.ReceivedAt)
                .Select(s => new SerialResponse(
                    s.Id, s.SerialNumber, s.Status, s.LocationId,
                    s.Batch != null ? s.Batch.BatchNumber : null,
                    s.ReceivedAt, s.SoldAt, s.SaleId))
                .ToListAsync();

            return Results.Ok(serials);
        });
    }

    private static IResult? RequireSameCompany(HttpContext http, Guid companyId)
        => http.User.GetCompanyId() == companyId ? null : Results.Forbid();
}
