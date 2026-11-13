using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Sales report queries shared by the report endpoints (ReportingEndpoints)
/// and the Claude connector (StockFlowMcpTools), so both always give the same numbers.
/// Only Completed sales count (a Held sale has no committed stock/cost yet). Cost and
/// profit come from SaleLine.BatchId -> Batch.PurchasePricePerBaseUnit (the real cost
/// of what was sold), not Product.PurchasePrice (today's catalog estimate).
/// <paramref name="from"/>/<paramref name="to"/> are whole days, both inclusive.</summary>
public static class ReportQueries
{
    public static async Task<SalesSummaryResponse> SalesSummaryAsync(
        PharmaStockDbContext db, Guid companyId, Guid? locationId, DateTime? from, DateTime? to)
    {
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

        var lineQuery = CompletedLines(db, companyId, locationId, from, to);

        var totalCost = await lineQuery.SumAsync(l =>
            (l.Batch != null ? l.Batch.PurchasePricePerBaseUnit : 0) * l.QuantityInBaseUnits);

        // VAT per line depends on the sale's mode: B2B adds it on top of the
        // net price (rate/100); B2C extracts it from the inclusive price (rate/(100+rate)).
        var totalTax = await lineQuery.SumAsync(l => l.Sale!.TaxAddedOnTop
            ? l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / 100m
            : l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / (100m + l.TaxRatePercent));

        return new SalesSummaryResponse(
            totalRevenue, totalCost, totalRevenue - totalCost,
            totalSalesCount, totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0,
            totalTax,
            dailyBreakdown);
    }

    public static async Task<List<TopProductItem>> TopProductsAsync(
        PharmaStockDbContext db, Guid companyId, Guid? locationId, DateTime? from, DateTime? to, int limit)
    {
        // Same reasoning as the sales summary: GroupBy + a conditional join into
        // Batch inside an aggregate doesn't translate here, so flatten first
        // and group the (typically low-thousands) rows in memory instead.
        var lineRows = await CompletedLines(db, companyId, locationId, from, to)
            .Select(l => new
            {
                l.ProductId,
                ProductName = l.Product!.Name,
                l.QuantityInBaseUnits,
                l.UnitPrice,
                BatchCost = l.Batch != null ? l.Batch.PurchasePricePerBaseUnit : 0
            })
            .ToListAsync();

        return lineRows
            .GroupBy(l => new { l.ProductId, l.ProductName })
            .Select(g => new TopProductItem(
                g.Key.ProductId,
                g.Key.ProductName,
                g.Sum(l => l.QuantityInBaseUnits),
                g.Sum(l => l.UnitPrice * l.QuantityInBaseUnits),
                g.Sum(l => (l.UnitPrice - l.BatchCost) * l.QuantityInBaseUnits)))
            .OrderByDescending(p => p.Revenue)
            .Take(limit)
            .ToList();
    }

    private static IQueryable<SaleLine> CompletedLines(
        PharmaStockDbContext db, Guid companyId, Guid? locationId, DateTime? from, DateTime? to)
    {
        var query = db.SaleLines.Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed);
        if (locationId is not null) query = query.Where(l => l.Sale!.LocationId == locationId);
        if (from is not null) query = query.Where(l => l.Sale!.Timestamp >= from.Value.Date);
        if (to is not null) query = query.Where(l => l.Sale!.Timestamp < to.Value.Date.AddDays(1));
        return query;
    }
}
