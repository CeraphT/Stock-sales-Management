using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record DailySalesItem(DateTime Date, decimal Revenue, int SalesCount);

public record SalesSummaryResponse(
    decimal TotalRevenue, decimal TotalCost, decimal TotalProfit,
    int TotalSalesCount, decimal AverageSaleValue,
    List<DailySalesItem> DailyBreakdown);

public record TopProductItem(Guid ProductId, string ProductName, int QuantitySold, decimal Revenue, decimal Profit);

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

            return Results.Ok(new SalesSummaryResponse(
                totalRevenue, totalCost, totalRevenue - totalCost,
                totalSalesCount, totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0,
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
    }
}
