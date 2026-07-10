using Microsoft.EntityFrameworkCore;
using PharmaStock.Api.Services;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Endpoints;

public record ReceiveStockRequest(string BatchNumber, DateTime? ExpiryDate, int QuantityInBaseUnits);
public record AdjustStockRequest(Guid BatchId, int DeltaInBaseUnits, string Reason);

public record BatchResponse(Guid Id, string BatchNumber, DateTime? ExpiryDate, int QuantityInBaseUnits, DateTime ReceivedAt);
public record StockMovementResponse(
    Guid Id, StockMovementType Type, int QuantityInBaseUnits, string? Reason,
    Guid? BatchId, string? BatchNumber, Guid UserId, string UserName, DateTime Timestamp);

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
                return Results.BadRequest(new { message = "QuantityInBaseUnits must be positive." });
            if (string.IsNullOrWhiteSpace(request.BatchNumber))
                return Results.BadRequest(new { message = "BatchNumber is required." });

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Product not found." });

            var batch = new Batch
            {
                ProductId = productId,
                BatchNumber = request.BatchNumber,
                ExpiryDate = request.ExpiryDate,
                QuantityInBaseUnits = request.QuantityInBaseUnits,
            };
            db.Batches.Add(batch);

            db.StockMovements.Add(new StockMovement
            {
                ProductId = productId,
                BatchId = batch.Id,
                Type = StockMovementType.Entry,
                QuantityInBaseUnits = request.QuantityInBaseUnits,
                UserId = http.User.GetUserId()!.Value,
            });

            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/products/{productId}/batches/{batch.Id}",
                new BatchResponse(batch.Id, batch.BatchNumber, batch.ExpiryDate, batch.QuantityInBaseUnits, batch.ReceivedAt));
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
                return Results.BadRequest(new { message = "DeltaInBaseUnits must be non-zero." });
            if (string.IsNullOrWhiteSpace(request.Reason))
                return Results.BadRequest(new { message = "Reason is required for a manual adjustment." });

            await using var transaction = await db.Database.BeginTransactionAsync();

            var batch = await db.Batches
                .FromSqlInterpolated($@"SELECT * FROM ""Batches"" WHERE ""Id"" = {request.BatchId} FOR UPDATE")
                .FirstOrDefaultAsync();
            if (batch is null || batch.ProductId != productId)
                return Results.NotFound(new { message = "Batch not found for this product." });

            var newBalance = batch.QuantityInBaseUnits + request.DeltaInBaseUnits;
            if (newBalance < 0)
            {
                await transaction.RollbackAsync();
                return Results.Conflict(new
                {
                    message = $"Adjustment would leave batch balance negative " +
                        $"({batch.QuantityInBaseUnits} + {request.DeltaInBaseUnits})."
                });
            }

            batch.QuantityInBaseUnits = newBalance;
            db.StockMovements.Add(new StockMovement
            {
                ProductId = productId,
                BatchId = batch.Id,
                Type = StockMovementType.Adjustment,
                QuantityInBaseUnits = request.DeltaInBaseUnits,
                Reason = request.Reason,
                UserId = http.User.GetUserId()!.Value,
            });

            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            return Results.Ok(new BatchResponse(batch.Id, batch.BatchNumber, batch.ExpiryDate, batch.QuantityInBaseUnits, batch.ReceivedAt));
        });

        // Section 3.3 — per-product, per-batch quantity view.
        group.MapGet("/batches", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            var forbidden = RequireSameCompany(http, companyId);
            if (forbidden is not null) return forbidden;

            var productExists = await db.Products.AnyAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (!productExists)
                return Results.NotFound(new { message = "Product not found." });

            var batches = await db.Batches
                .Where(b => b.ProductId == productId)
                .OrderBy(b => b.ExpiryDate)
                .Select(b => new BatchResponse(b.Id, b.BatchNumber, b.ExpiryDate, b.QuantityInBaseUnits, b.ReceivedAt))
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
                return Results.NotFound(new { message = "Product not found." });

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
    }

    private static IResult? RequireSameCompany(HttpContext http, Guid companyId)
        => http.User.GetCompanyId() == companyId ? null : Results.Forbid();
}
