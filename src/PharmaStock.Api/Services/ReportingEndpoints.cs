using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record DailySalesItem(DateTime Date, decimal Revenue, int SalesCount);

public record SalesSummaryResponse(
    decimal TotalRevenue, decimal TotalCost, decimal TotalProfit,
    int TotalSalesCount, decimal AverageSaleValue,
    decimal TotalTax,
    List<DailySalesItem> DailyBreakdown);

public record TopProductItem(Guid ProductId, string ProductName, int QuantitySold, decimal Revenue, decimal Profit);

public record DemandForecastItem(
    Guid ProductId, string ProductName, int UnitsSold, double AvgDailyUnits,
    int CurrentStock, double? DaysOfCover, int SuggestedReorder, double TrendPct);

public record DeadStockItem(
    Guid ProductId, string ProductName, int CurrentStock, decimal StockValue,
    DateTime? LastSaleDate, int? DaysSinceLastSale);

// Section 14 — reporting. Both endpoints only ever consider Completed sales
// (a Held sale has no committed stock/cost yet, so including it would both
// overstate revenue and have no batch to cost against). Cost/profit are
// computed from SaleLine.BatchId -> Batch.PurchasePricePerBaseUnit (the real
// historical cost of what was actually sold), not Product.PurchasePrice
// (today's catalog estimate) — see the note on Batch.PurchasePricePerBaseUnit.
public static class ReportingEndpoints
{
    public static void MapReportingEndpoints(this WebApplication app)
    {
        app.MapGet("/api/companies/{companyId:guid}/reports/sales-summary", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var salesQuery = db.Sales.Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed);
            if (locationId is not null) salesQuery = salesQuery.Where(s => s.LocationId == locationId);
            if (from is not null) salesQuery = salesQuery.Where(s => s.Timestamp >= from.Value.Date);
            if (to is not null) salesQuery = salesQuery.Where(s => s.Timestamp < to.Value.Date.AddDays(1));

            // GroupBy().Select(g => new SomeRecord(...)) doesn't translate to SQL
            // here (Npgsql can't build the record's positional constructor from
            // grouped aggregates) — pull the flat rows down and group in memory
            // instead, same workaround already used in DashboardEndpoints.
            var salesRows = await salesQuery
                .Select(s => new { s.Timestamp, s.Total })
                .ToListAsync();

            var dailyBreakdown = salesRows
                .GroupBy(s => s.Timestamp.Date)
                .Select(g => new DailySalesItem(g.Key, g.Sum(s => s.Total), g.Count()))
                .OrderBy(d => d.Date)
                .ToList();

            var totalRevenue = salesRows.Sum(s => s.Total);
            var totalSalesCount = salesRows.Count;

            var lineQuery = db.SaleLines.Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed);
            if (locationId is not null) lineQuery = lineQuery.Where(l => l.Sale!.LocationId == locationId);
            if (from is not null) lineQuery = lineQuery.Where(l => l.Sale!.Timestamp >= from.Value.Date);
            if (to is not null) lineQuery = lineQuery.Where(l => l.Sale!.Timestamp < to.Value.Date.AddDays(1));

            var totalCost = await lineQuery.SumAsync(l =>
                (l.Batch != null ? l.Batch.PurchasePricePerBaseUnit : 0) * l.QuantityInBaseUnits);

            // VAT per line depends on the sale's mode: B2B adds it on top of the
            // net price (rate/100); B2C extracts it from the inclusive price (rate/(100+rate)).
            var totalTax = await lineQuery.SumAsync(l => l.Sale!.TaxAddedOnTop
                ? l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / 100m
                : l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / (100m + l.TaxRatePercent));

            return Results.Ok(new SalesSummaryResponse(
                totalRevenue, totalCost, totalRevenue - totalCost,
                totalSalesCount, totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0,
                totalTax,
                dailyBreakdown));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/reports/top-products", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to, int? limit,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var query = db.SaleLines.Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed);
            if (locationId is not null) query = query.Where(l => l.Sale!.LocationId == locationId);
            if (from is not null) query = query.Where(l => l.Sale!.Timestamp >= from.Value.Date);
            if (to is not null) query = query.Where(l => l.Sale!.Timestamp < to.Value.Date.AddDays(1));

            // Same reasoning as sales-summary: GroupBy + a conditional join into
            // Batch inside an aggregate doesn't translate here, so flatten first
            // and group the (typically low-thousands) rows in memory instead.
            var lineRows = await query
                .Select(l => new
                {
                    l.ProductId,
                    ProductName = l.Product!.Name,
                    l.QuantityInBaseUnits,
                    l.UnitPrice,
                    BatchCost = l.Batch != null ? l.Batch.PurchasePricePerBaseUnit : 0
                })
                .ToListAsync();

            var topProducts = lineRows
                .GroupBy(l => new { l.ProductId, l.ProductName })
                .Select(g => new TopProductItem(
                    g.Key.ProductId,
                    g.Key.ProductName,
                    g.Sum(l => l.QuantityInBaseUnits),
                    g.Sum(l => l.UnitPrice * l.QuantityInBaseUnits),
                    g.Sum(l => (l.UnitPrice - l.BatchCost) * l.QuantityInBaseUnits)))
                .OrderByDescending(p => p.Revenue)
                .Take(limit ?? 20)
                .ToList();

            return Results.Ok(topProducts);
        }).RequireAuthorization();

        // Demand forecast — per product: recent sales velocity, days of cover
        // left at that rate, a suggested reorder quantity for the horizon, and a
        // trend (this window vs the one before it, a lightweight seasonality
        // signal). Only products that actually sold in the window are forecast.
        app.MapGet("/api/companies/{companyId:guid}/reports/demand-forecast", async (
            Guid companyId, int? days, int? horizon, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();
            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var window = days is > 0 ? days.Value : 30;
            var horizonDays = horizon is > 0 ? horizon.Value : 30;
            var today = DateTime.UtcNow.Date;
            var cutoff = today.AddDays(-window);
            var prevCutoff = today.AddDays(-2 * window);

            var lineRows = await db.SaleLines
                .Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed && l.Sale.Timestamp >= prevCutoff)
                .Select(l => new { l.ProductId, ProductName = l.Product!.Name, l.QuantityInBaseUnits, Ts = l.Sale!.Timestamp })
                .ToListAsync();

            var stock = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive && !p.HasVariants)
                .Select(p => new { p.Id, Stock = p.Batches.Sum(b => (int?)b.QuantityInBaseUnits) ?? 0 })
                .ToListAsync();
            var stockMap = stock.ToDictionary(s => s.Id, s => s.Stock);

            var items = lineRows
                .GroupBy(l => new { l.ProductId, l.ProductName })
                .Select(g =>
                {
                    var recent = g.Where(l => l.Ts >= cutoff).Sum(l => l.QuantityInBaseUnits);
                    var prev = g.Where(l => l.Ts < cutoff).Sum(l => l.QuantityInBaseUnits);
                    var avgDaily = (double)recent / window;
                    var current = stockMap.TryGetValue(g.Key.ProductId, out var s) ? s : 0;
                    double? cover = avgDaily > 0 ? current / avgDaily : null;
                    var suggested = Math.Max(0, (int)Math.Round(avgDaily * horizonDays) - current);
                    var trend = prev > 0 ? (double)(recent - prev) / prev * 100 : (recent > 0 ? 100.0 : 0.0);
                    return new DemandForecastItem(g.Key.ProductId, g.Key.ProductName, recent, Math.Round(avgDaily, 2), current,
                        cover.HasValue ? Math.Round(cover.Value, 1) : null, suggested, Math.Round(trend, 0));
                })
                .Where(i => i.UnitsSold > 0)
                .OrderBy(i => i.DaysOfCover ?? double.MaxValue)
                .ToList();

            return Results.Ok(items);
        }).RequireAuthorization();

        // Dead-stock — items still holding stock that haven't sold within the
        // window (or ever), with the money tied up in them (cost value), so slow
        // movers can be spotted and liquidated. Ordered by value at risk.
        app.MapGet("/api/companies/{companyId:guid}/reports/dead-stock", async (
            Guid companyId, int? days, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();
            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var window = days is > 0 ? days.Value : 60;
            var today = DateTime.UtcNow.Date;
            var cutoff = today.AddDays(-window);

            var lastSales = await db.SaleLines
                .Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed)
                .GroupBy(l => l.ProductId)
                .Select(g => new { ProductId = g.Key, Last = g.Max(l => l.Sale!.Timestamp) })
                .ToListAsync();
            var lastMap = lastSales.ToDictionary(x => x.ProductId, x => x.Last);

            var prods = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive && !p.HasVariants)
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    Stock = p.Batches.Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
                    Value = p.Batches.Sum(b => (decimal?)(b.QuantityInBaseUnits * b.PurchasePricePerBaseUnit)) ?? 0m,
                })
                .ToListAsync();

            var dead = prods
                .Where(p => p.Stock > 0)
                .Select(p =>
                {
                    DateTime? last = lastMap.TryGetValue(p.Id, out var l) ? l : null;
                    int? since = last.HasValue ? (int)(today - last.Value.Date).TotalDays : null;
                    return new { p, last, since };
                })
                .Where(x => x.last == null || x.last.Value.Date < cutoff)
                .Select(x => new DeadStockItem(x.p.Id, x.p.Name, x.p.Stock, x.p.Value, x.last, x.since))
                .OrderByDescending(d => d.StockValue)
                .ToList();

            return Results.Ok(dead);
        }).RequireAuthorization();
    }
}
