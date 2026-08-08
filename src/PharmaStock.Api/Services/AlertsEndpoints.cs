using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record StockAlertItem(
    Guid ProductId, string Name, int CurrentStock, int LowStockThreshold,
    // When an open purchase order (Pending / PartiallyReceived) already covers
    // this product, the alert links to it ("print/share the existing order")
    // instead of prompting a new one.
    Guid? OpenPurchaseOrderId = null, PurchaseOrderStatus? OpenPurchaseOrderStatus = null);
public record ExpiryAlertItem(
    Guid ProductId, string Name, Guid BatchId, string BatchNumber,
    DateTime ExpiryDate, int QuantityInBaseUnits, int DaysUntilExpiry);
public record AlertsResponse(
    List<StockAlertItem> OutOfStock,
    List<StockAlertItem> LowStock,
    List<ExpiryAlertItem> ExpiringSoon,
    List<ExpiryAlertItem> Expired);

/// <summary>Read-only "what needs attention now" feed powering the in-app alerts
/// centre: products at/below their low-stock threshold or out of stock, and
/// batches already expired or expiring within a window. Computed on demand from
/// the same batch/threshold data the dashboard tiles use — no new storage, no
/// email/push transport (that would need an SMTP/push provider + a scheduled
/// scan, tracked as a follow-up).</summary>
public static class AlertsEndpoints
{
    public static void MapAlertsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/companies/{companyId:guid}/alerts", async (
            Guid companyId, int? expiryWithinDays, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var withinDays = expiryWithinDays is > 0 ? expiryWithinDays.Value : 30;
            var today = DateTime.UtcNow.Date;
            var soonCutoff = today.AddDays(withinDays);

            // Variant-parent headers hold no stock of their own, so they'd always
            // read "out of stock" — exclude them, same as POS search / catalog.
            var products = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive && !p.HasVariants)
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.LowStockThreshold,
                    TotalStock = p.Batches.Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
                })
                .ToListAsync();

            // Products already covered by an open PO (most-recent one wins), so a
            // low/out-of-stock alert can point at the existing order to print/share.
            var openPoLines = await db.PurchaseOrderLines
                .Where(l => l.PurchaseOrder!.CompanyId == companyId
                    && (l.PurchaseOrder.Status == PurchaseOrderStatus.Pending
                        || l.PurchaseOrder.Status == PurchaseOrderStatus.PartiallyReceived))
                .OrderByDescending(l => l.PurchaseOrder!.CreatedAt)
                .Select(l => new { l.ProductId, l.PurchaseOrderId, Status = l.PurchaseOrder!.Status })
                .ToListAsync();
            var openPo = openPoLines
                .GroupBy(x => x.ProductId)
                .ToDictionary(g => g.Key, g => g.First());

            (Guid?, PurchaseOrderStatus?) PoFor(Guid productId) =>
                openPo.TryGetValue(productId, out var po) ? (po.PurchaseOrderId, po.Status) : (null, null);

            var outOfStock = products
                .Where(p => p.TotalStock <= 0)
                .Select(p => { var (poId, st) = PoFor(p.Id); return new StockAlertItem(p.Id, p.Name, p.TotalStock, p.LowStockThreshold, poId, st); })
                .OrderBy(p => p.Name)
                .ToList();

            var lowStock = products
                .Where(p => p.TotalStock > 0 && p.LowStockThreshold > 0 && p.TotalStock <= p.LowStockThreshold)
                .Select(p => { var (poId, st) = PoFor(p.Id); return new StockAlertItem(p.Id, p.Name, p.TotalStock, p.LowStockThreshold, poId, st); })
                .OrderBy(p => p.CurrentStock)
                .ToList();

            // Batch-level expiry — only batches that still hold stock.
            var batches = await db.Batches
                .Where(b => b.Product!.CompanyId == companyId && b.Product.IsActive
                    && b.QuantityInBaseUnits > 0 && b.ExpiryDate != null)
                .Select(b => new
                {
                    b.Id,
                    b.ProductId,
                    ProductName = b.Product!.Name,
                    b.BatchNumber,
                    ExpiryDate = b.ExpiryDate!.Value,
                    b.QuantityInBaseUnits,
                })
                .ToListAsync();

            var expired = batches
                .Where(b => b.ExpiryDate.Date < today)
                .Select(b => new ExpiryAlertItem(b.ProductId, b.ProductName, b.Id, b.BatchNumber,
                    b.ExpiryDate, b.QuantityInBaseUnits, (int)(b.ExpiryDate.Date - today).TotalDays))
                .OrderBy(b => b.ExpiryDate)
                .ToList();

            var expiringSoon = batches
                .Where(b => b.ExpiryDate.Date >= today && b.ExpiryDate.Date <= soonCutoff)
                .Select(b => new ExpiryAlertItem(b.ProductId, b.ProductName, b.Id, b.BatchNumber,
                    b.ExpiryDate, b.QuantityInBaseUnits, (int)(b.ExpiryDate.Date - today).TotalDays))
                .OrderBy(b => b.ExpiryDate)
                .ToList();

            return Results.Ok(new AlertsResponse(outOfStock, lowStock, expiringSoon, expired));
        }).RequireAuthorization();
    }
}
