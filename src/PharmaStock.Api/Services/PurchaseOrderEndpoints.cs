using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record PurchaseOrderLineRequest(Guid ProductId, int QuantityOrdered, decimal UnitCost);
public record CreatePurchaseOrderRequest(Guid LocationId, Guid SupplierId, string? Notes, List<PurchaseOrderLineRequest> Lines);
public record ReceivePurchaseOrderLineRequest(int QuantityReceivedNow, string BatchNumber, DateTime? ExpiryDate, decimal? ActualUnitCost);

public record PurchaseOrderLineResponse(Guid Id, Guid ProductId, string ProductName, int QuantityOrdered, int QuantityReceived, decimal UnitCost);
public record PurchaseOrderSummaryResponse(Guid Id, DateTime CreatedAt, string SupplierName, string LocationName, PurchaseOrderStatus Status, int LineCount, decimal TotalCost);
public record PurchaseOrderDetailResponse(Guid Id, DateTime CreatedAt, string SupplierName, string LocationName, PurchaseOrderStatus Status, string? Notes, List<PurchaseOrderLineResponse> Lines);

// Section 3.4 — ordering stock from a supplier. A PO is never itself a stock
// source: every receipt against a line goes through the exact same
// Batch + StockMovement(Entry) creation as a manual stock receive
// (StockMovementEndpoints), just with the batch/expiry captured per-delivery
// instead of the ordered quantity assumed to arrive all at once.
public static class PurchaseOrderEndpoints
{
    public static void MapPurchaseOrderEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/purchase-orders").RequireAuthorization();

        group.MapPost("/", async (Guid companyId, CreatePurchaseOrderRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerUserId = http.User.GetUserId();
            if (http.User.GetCompanyId() != companyId || callerUserId is null)
                return Results.Forbid();

            if (request.Lines.Count == 0)
                return Results.BadRequest(new { message = "La commande doit contenir au moins une ligne." });
            if (request.Lines.Any(l => l.QuantityOrdered <= 0))
                return Results.BadRequest(new { message = "Les quantités commandées doivent être positives." });
            if (request.Lines.Any(l => l.UnitCost < 0))
                return Results.BadRequest(new { message = "Le coût unitaire ne peut pas être négatif." });

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            var supplierExists = await db.Suppliers.AnyAsync(s => s.Id == request.SupplierId && s.CompanyId == companyId);
            if (!supplierExists)
                return Results.NotFound(new { message = "Fournisseur introuvable." });

            var productIds = request.Lines.Select(l => l.ProductId).Distinct().ToList();
            var validProductIds = await db.Products
                .Where(p => productIds.Contains(p.Id) && p.CompanyId == companyId && p.IsActive)
                .Select(p => p.Id)
                .ToListAsync();
            if (validProductIds.Count != productIds.Count)
                return Results.BadRequest(new { message = "Un ou plusieurs produits sont introuvables ou archivés." });

            var order = new PurchaseOrder
            {
                CompanyId = companyId,
                LocationId = request.LocationId,
                SupplierId = request.SupplierId,
                CreatedByUserId = callerUserId.Value,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                Lines = request.Lines.Select(l => new PurchaseOrderLine
                {
                    ProductId = l.ProductId,
                    QuantityOrderedInBaseUnits = l.QuantityOrdered,
                    UnitCost = l.UnitCost,
                }).ToList(),
            };
            db.PurchaseOrders.Add(order);
            await db.SaveChangesAsync();

            var detail = await LoadDetailAsync(db, companyId, order.Id);
            return Results.Created($"/api/companies/{companyId}/purchase-orders/{order.Id}", detail);
        });

        group.MapGet("/", async (Guid companyId, PurchaseOrderStatus? status, Guid? locationId, Guid? supplierId, DateTime? from, DateTime? to, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.PurchaseOrders.Where(o => o.CompanyId == companyId);
            if (status is not null) query = query.Where(o => o.Status == status);
            if (locationId is not null) query = query.Where(o => o.LocationId == locationId);
            if (supplierId is not null) query = query.Where(o => o.SupplierId == supplierId);
            if (from is not null) query = query.Where(o => o.CreatedAt >= from.Value.Date);
            if (to is not null) query = query.Where(o => o.CreatedAt < to.Value.Date.AddDays(1));

            // Flatten first, aggregate in memory — GroupBy().Select(g => new
            // Record(...)) doesn't translate here, same as ReportingEndpoints.
            var rows = await query
                .OrderByDescending(o => o.CreatedAt)
                .Select(o => new
                {
                    o.Id,
                    o.CreatedAt,
                    SupplierName = o.Supplier!.Name,
                    LocationName = o.Location!.Name,
                    o.Status,
                    Lines = o.Lines.Select(l => new { l.QuantityOrderedInBaseUnits, l.UnitCost }).ToList(),
                })
                .ToListAsync();

            var summaries = rows.Select(o => new PurchaseOrderSummaryResponse(
                o.Id, o.CreatedAt, o.SupplierName, o.LocationName, o.Status,
                o.Lines.Count, o.Lines.Sum(l => l.QuantityOrderedInBaseUnits * l.UnitCost)));

            return Results.Ok(summaries);
        });

        group.MapGet("/{id:guid}", async (Guid companyId, Guid id, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var detail = await LoadDetailAsync(db, companyId, id);
            return detail is null ? Results.NotFound(new { message = "Commande introuvable." }) : Results.Ok(detail);
        });

        group.MapPost("/{id:guid}/lines/{lineId:guid}/receive", async (
            Guid companyId, Guid id, Guid lineId, ReceivePurchaseOrderLineRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerUserId = http.User.GetUserId();
            if (http.User.GetCompanyId() != companyId || callerUserId is null)
                return Results.Forbid();

            if (request.QuantityReceivedNow <= 0)
                return Results.BadRequest(new { message = "La quantité reçue doit être positive." });
            if (string.IsNullOrWhiteSpace(request.BatchNumber))
                return Results.BadRequest(new { message = "Le numéro de lot est requis." });
            if (request.ExpiryDate is null)
                return Results.BadRequest(new { message = "La date d'expiration est requise." });

            var order = await db.PurchaseOrders
                .Include(o => o.Lines)
                .FirstOrDefaultAsync(o => o.Id == id && o.CompanyId == companyId);
            if (order is null)
                return Results.NotFound(new { message = "Commande introuvable." });
            if (order.Status == PurchaseOrderStatus.Cancelled)
                return Results.BadRequest(new { message = "Cette commande a été annulée." });

            var line = order.Lines.FirstOrDefault(l => l.Id == lineId);
            if (line is null)
                return Results.NotFound(new { message = "Ligne de commande introuvable." });

            var remaining = line.QuantityOrderedInBaseUnits - line.QuantityReceivedInBaseUnits;
            if (request.QuantityReceivedNow > remaining)
                return Results.BadRequest(new { message = $"La quantité reçue dépasse la quantité restante ({remaining})." });

            var batch = new Batch
            {
                ProductId = line.ProductId,
                LocationId = order.LocationId,
                BatchNumber = request.BatchNumber.Trim(),
                ExpiryDate = request.ExpiryDate,
                QuantityInBaseUnits = request.QuantityReceivedNow,
                PurchasePricePerBaseUnit = request.ActualUnitCost ?? line.UnitCost,
            };
            db.Batches.Add(batch);

            db.StockMovements.Add(new StockMovement
            {
                ProductId = line.ProductId,
                BatchId = batch.Id,
                LocationId = order.LocationId,
                Type = StockMovementType.Entry,
                QuantityInBaseUnits = request.QuantityReceivedNow,
                UserId = callerUserId.Value,
            });

            line.QuantityReceivedInBaseUnits += request.QuantityReceivedNow;
            order.Status = order.Lines.All(l => l.QuantityReceivedInBaseUnits >= l.QuantityOrderedInBaseUnits)
                ? PurchaseOrderStatus.Received
                : PurchaseOrderStatus.PartiallyReceived;

            await db.SaveChangesAsync();

            var detail = await LoadDetailAsync(db, companyId, order.Id);
            return Results.Ok(detail);
        });

        group.MapPost("/{id:guid}/cancel", async (Guid companyId, Guid id, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var order = await db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id && o.CompanyId == companyId);
            if (order is null)
                return Results.NotFound(new { message = "Commande introuvable." });
            if (order.Status != PurchaseOrderStatus.Pending)
                return Results.BadRequest(new { message = "Seule une commande sans réception ne peut être annulée." });

            order.Status = PurchaseOrderStatus.Cancelled;
            await db.SaveChangesAsync();

            var detail = await LoadDetailAsync(db, companyId, order.Id);
            return Results.Ok(detail);
        });
    }

    private static async Task<PurchaseOrderDetailResponse?> LoadDetailAsync(PharmaStockDbContext db, Guid companyId, Guid id)
    {
        var order = await db.PurchaseOrders
            .Where(o => o.Id == id && o.CompanyId == companyId)
            .Select(o => new
            {
                o.Id,
                o.CreatedAt,
                SupplierName = o.Supplier!.Name,
                LocationName = o.Location!.Name,
                o.Status,
                o.Notes,
                Lines = o.Lines.Select(l => new PurchaseOrderLineResponse(
                    l.Id, l.ProductId, l.Product!.Name, l.QuantityOrderedInBaseUnits, l.QuantityReceivedInBaseUnits, l.UnitCost)).ToList(),
            })
            .FirstOrDefaultAsync();

        return order is null
            ? null
            : new PurchaseOrderDetailResponse(order.Id, order.CreatedAt, order.SupplierName, order.LocationName, order.Status, order.Notes, order.Lines);
    }
}
