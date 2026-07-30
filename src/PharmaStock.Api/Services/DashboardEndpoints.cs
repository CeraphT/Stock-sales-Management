using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

// Quantity is expressed in whatever packaging level the line was actually
// sold in (e.g. 2 "Boîte"), not raw base units, mirroring how PosPage's own
// cart already displays a line — "unité" when no packaging level applied.
public record RecentSaleLineItem(string Name, int Quantity, string UnitLabel);

public record RecentSaleItem(Guid Id, decimal Total, PaymentMethod PaymentMethod, DateTime Timestamp, List<RecentSaleLineItem> Items);

// One point per calendar day, always exactly 7 of them (today back to 6 days
// ago) — including zero-revenue days, so the Desktop chart never has to
// guess whether a missing day means "no sales" or "not fetched yet".
public record DailyRevenuePoint(DateTime Date, decimal Revenue);

public record DashboardSummaryResponse(
    decimal TodayRevenue, int TodaySalesCount,
    int TotalProducts, int LowStockCount, int OutOfStockCount,
    int ExpiringSoonCount, int ExpiredCount, int ArchivedProductsCount,
    List<RecentSaleItem> RecentSales,
    int NegativeStockBatchCount, int AutoClosedShiftConflictCount,
    List<DailyRevenuePoint> RevenueTrend
);

public static class DashboardEndpoints
{
    private const int RecentSalesCount = 5;

    // Matches the exact marker text SyncEndpoints.cs writes into
    // CashRegisterShift.ClosingNotes when two offline devices both open a
    // shift at the same location — there's no dedicated boolean flag for
    // this, so a shared marker string is the lightest-weight way to surface
    // it here without a schema change.
    internal const string ShiftConflictMarker = "Auto-fermée : conflit avec une caisse ouverte simultanément";

    public static void MapDashboardEndpoints(this WebApplication app)
    {
        app.MapGet("/api/companies/{companyId:guid}/dashboard/summary", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            // UTC calendar day — a known simplification (Cameroon is UTC+1, no
            // DST), can be off by up to an hour around local midnight. Fine for
            // a first pass; revisit if precise daily cash-closing boundaries
            // matter later (Section 3.6).
            var todayStart = DateTime.UtcNow.Date;
            var todayEnd = todayStart.AddDays(1);

            var todaySales = await db.Sales
                .Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed &&
                    s.Timestamp >= todayStart && s.Timestamp < todayEnd)
                .Select(s => s.Total)
                .ToListAsync();

            // Last 7 days (today back to 6 days ago) for the Desktop revenue
            // trend chart. Fetched as flat (Timestamp, Total) rows and
            // grouped by calendar day in memory rather than a SQL GROUP BY —
            // this is what fills in a $0 point for a day with zero sales,
            // which a GROUP BY (over rows that don't exist) can't produce
            // without a separate calendar-table join.
            var trendStart = todayStart.AddDays(-6);
            var trendSales = await db.Sales
                .Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed &&
                    s.Timestamp >= trendStart && s.Timestamp < todayEnd)
                .Select(s => new { s.Timestamp, s.Total })
                .ToListAsync();
            var revenueTrend = Enumerable.Range(0, 7)
                .Select(offset => trendStart.AddDays(offset))
                .Select(date => new DailyRevenuePoint(date, trendSales.Where(s => s.Timestamp.Date == date).Sum(s => s.Total)))
                .ToList();

            // Archived products are excluded from stock-health counts — they
            // can't be sold regardless of their stock level, so counting them
            // here would overstate "Produits"/"Rupture de stock" against what
            // the catalog (also IsActive-only) actually shows. They get their
            // own dedicated count instead.
            var productStock = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive)
                .Select(p => new
                {
                    TotalStock = p.Batches.Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
                    p.LowStockThreshold,
                    EarliestExpiry = p.Batches
                        .Where(b => b.ExpiryDate.HasValue && b.QuantityInBaseUnits > 0)
                        .OrderBy(b => b.ExpiryDate)
                        .Select(b => b.ExpiryDate)
                        .FirstOrDefault()
                })
                .ToListAsync();

            var archivedProductsCount = await db.Products.CountAsync(p => p.CompanyId == companyId && !p.IsActive);

            // Section 6 — offline-sync conflict signals for admin review.
            // Batch has no direct CompanyId, so this scopes through Product.
            var negativeStockBatchCount = await db.Batches
                .CountAsync(b => b.Product!.CompanyId == companyId && b.QuantityInBaseUnits < 0);
            var autoClosedShiftConflictCount = await db.CashRegisterShifts
                .CountAsync(s => s.CompanyId == companyId && s.ClosingNotes != null && s.ClosingNotes.Contains(ShiftConflictMarker));

            var today = DateTime.UtcNow.Date;
            var soonCutoff = today.AddDays(30);
            var expiringSoonCount = productStock.Count(p => p.EarliestExpiry != null && p.EarliestExpiry >= today && p.EarliestExpiry <= soonCutoff);
            var expiredCount = productStock.Count(p => p.EarliestExpiry != null && p.EarliestExpiry < today);

            // EF/Npgsql can't translate a Concat() of two child collections inside
            // an outer Select (set operation after a client projection) — fetch
            // the sale headers and both line kinds as three flat queries instead,
            // then stitch them together in memory below.
            var recentSalesBase = await db.Sales
                .Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed)
                .OrderByDescending(s => s.Timestamp)
                .Take(RecentSalesCount)
                .Select(s => new { s.Id, s.Total, s.PaymentMethod, s.Timestamp })
                .ToListAsync();

            var recentSaleIds = recentSalesBase.Select(s => s.Id).ToList();

            var recentProductItems = await db.SaleLines
                .Where(l => recentSaleIds.Contains(l.SaleId))
                .Select(l => new
                {
                    l.SaleId,
                    Item = new RecentSaleLineItem(
                        l.Product!.Name,
                        l.PackagingLevel != null ? l.QuantityInBaseUnits / l.PackagingLevel.QuantityInBaseUnits : l.QuantityInBaseUnits,
                        l.PackagingLevel != null ? l.PackagingLevel.UnitName : "unité")
                })
                .ToListAsync();

            var recentServiceItems = await db.ServiceLines
                .Where(l => recentSaleIds.Contains(l.SaleId))
                .Select(l => new { l.SaleId, Item = new RecentSaleLineItem(l.Service!.Name, l.Quantity, "service") })
                .ToListAsync();

            var recentSales = recentSalesBase
                .Select(s => new RecentSaleItem(
                    s.Id, s.Total, s.PaymentMethod, s.Timestamp,
                    recentProductItems.Where(p => p.SaleId == s.Id).Select(p => p.Item)
                        .Concat(recentServiceItems.Where(x => x.SaleId == s.Id).Select(x => x.Item))
                        .ToList()))
                .ToList();

            return Results.Ok(new DashboardSummaryResponse(
                todaySales.Sum(),
                todaySales.Count,
                productStock.Count,
                productStock.Count(p => p.TotalStock > 0 && p.TotalStock <= p.LowStockThreshold),
                productStock.Count(p => p.TotalStock <= 0),
                expiringSoonCount,
                expiredCount,
                archivedProductsCount,
                recentSales,
                negativeStockBatchCount,
                autoClosedShiftConflictCount,
                revenueTrend));
        }).RequireAuthorization();
    }
}
