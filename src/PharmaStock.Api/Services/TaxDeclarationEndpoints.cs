using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record TaxDeclarationResponse(
    DateTime? From, DateTime? To, decimal StandardRatePercent,
    decimal SalesTtc, decimal SalesHt, decimal VatCollected,
    decimal PurchasesTtc, decimal PurchasesHt, decimal VatDeductible,
    decimal VatDue, int SalesCount);

// One row of the sales journal (journal des ventes) — the itemised list of
// sales a tax filing requires, each broken into HT / TVA / TTC.
public record SalesJournalItem(
    Guid Id, DateTime Timestamp, string? CustomerName, PaymentMethod PaymentMethod,
    decimal Ht, decimal Vat, decimal Ttc);

// One row of the purchases journal (journal des achats) — a supplier receipt
// (Entry movement) broken into HT / TVA déductible / TTC.
public record PurchasesJournalItem(
    Guid Id, DateTime Timestamp, string ProductName, string BatchNumber, string? SupplierName,
    decimal Ht, decimal Vat, decimal Ttc);

// One row of the cash book (livre de caisse) — a cash-register shift with its
// opening float, cash taken in, and closing count.
public record CashBookItem(
    Guid Id, DateTime OpenedAt, DateTime? ClosedAt, string CashierName,
    decimal OpeningCash, decimal CashSales, decimal? ExpectedCash, decimal? ClosingCash, decimal? Discrepancy);

/// <summary>
/// OHADA/SYSCOHADA-oriented VAT (TVA) declaration for a period. Produces the
/// figures a Cameroon business files monthly:
///   • TVA collectée  — VAT charged on sales           (SYSCOHADA acct 4431)
///   • TVA déductible — VAT paid on purchases          (SYSCOHADA acct 4452)
///   • TVA due        — collectée − déductible          (SYSCOHADA acct 4441)
/// Prices are VAT-inclusive (TTC), so VAT = gross × rate/(100+rate). The
/// purchase side has no stored VAT rate, so it's approximated at the company's
/// current standard rate — the report labels this so an accountant can adjust.
/// </summary>
public static class TaxDeclarationEndpoints
{
    public static void MapTaxDeclarationEndpoints(this WebApplication app)
    {
        app.MapGet("/api/companies/{companyId:guid}/reports/tax-declaration", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });
            var rate = company.DefaultTaxRatePercent;

            // ── Sales side (TVA collectée) ─────────────────────────────────
            var salesQuery = db.Sales.Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed);
            if (locationId is not null) salesQuery = salesQuery.Where(s => s.LocationId == locationId);
            if (from is not null) salesQuery = salesQuery.Where(s => s.Timestamp >= from.Value.Date);
            if (to is not null) salesQuery = salesQuery.Where(s => s.Timestamp < to.Value.Date.AddDays(1));

            var salesTtc = await salesQuery.SumAsync(s => s.Total);
            var salesCount = await salesQuery.CountAsync();

            var saleLines = db.SaleLines.Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed);
            if (locationId is not null) saleLines = saleLines.Where(l => l.Sale!.LocationId == locationId);
            if (from is not null) saleLines = saleLines.Where(l => l.Sale!.Timestamp >= from.Value.Date);
            if (to is not null) saleLines = saleLines.Where(l => l.Sale!.Timestamp < to.Value.Date.AddDays(1));

            var vatCollected = await saleLines.SumAsync(l => l.Sale!.TaxAddedOnTop
                ? l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / 100m
                : l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / (100m + l.TaxRatePercent));
            var salesHt = salesTtc - vatCollected;

            // ── Purchases side (TVA déductible) ────────────────────────────
            // Supplier receipts = Entry movements valued at their batch cost.
            var entries = db.StockMovements.Where(m =>
                m.Type == StockMovementType.Entry && m.BatchId != null && m.Product!.CompanyId == companyId);
            if (locationId is not null) entries = entries.Where(m => m.LocationId == locationId);
            if (from is not null) entries = entries.Where(m => m.Timestamp >= from.Value.Date);
            if (to is not null) entries = entries.Where(m => m.Timestamp < to.Value.Date.AddDays(1));

            var purchasesTtc = await entries.SumAsync(m => m.QuantityInBaseUnits * m.Batch!.PurchasePricePerBaseUnit);
            // Exact per-batch input VAT (rate captured at receiving); cost is TTC.
            var vatDeductible = await entries.SumAsync(m =>
                m.QuantityInBaseUnits * m.Batch!.PurchasePricePerBaseUnit * m.Batch.PurchaseVatRatePercent / (100m + m.Batch.PurchaseVatRatePercent));
            var purchasesHt = purchasesTtc - vatDeductible;

            var vatDue = vatCollected - vatDeductible;

            return Results.Ok(new TaxDeclarationResponse(
                from, to, rate,
                salesTtc, salesHt, vatCollected,
                purchasesTtc, purchasesHt, vatDeductible,
                vatDue, salesCount));
        }).RequireAuthorization();

        // Journal des ventes — the itemised sales list (date, customer, HT/TVA/TTC)
        // that supports the VAT declaration.
        app.MapGet("/api/companies/{companyId:guid}/reports/sales-journal", async (
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

            var sales = await salesQuery
                .Select(s => new { s.Id, s.Timestamp, s.PaymentMethod, CustomerName = s.Customer != null ? s.Customer.Name : null, Ttc = s.Total })
                .ToListAsync();

            // Per-sale VAT: pull line VAT flat, group in memory (GroupBy→aggregate
            // doesn't translate cleanly here — same workaround as ReportingEndpoints).
            var lineQuery = db.SaleLines.Where(l => l.Sale!.CompanyId == companyId && l.Sale.Status == SaleStatus.Completed);
            if (locationId is not null) lineQuery = lineQuery.Where(l => l.Sale!.LocationId == locationId);
            if (from is not null) lineQuery = lineQuery.Where(l => l.Sale!.Timestamp >= from.Value.Date);
            if (to is not null) lineQuery = lineQuery.Where(l => l.Sale!.Timestamp < to.Value.Date.AddDays(1));

            var lineVat = await lineQuery
                .Select(l => new
                {
                    l.SaleId,
                    Vat = l.Sale!.TaxAddedOnTop
                        ? l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / 100m
                        : l.UnitPrice * l.QuantityInBaseUnits * l.TaxRatePercent / (100m + l.TaxRatePercent),
                })
                .ToListAsync();
            var vatBySale = lineVat.GroupBy(x => x.SaleId).ToDictionary(g => g.Key, g => g.Sum(x => x.Vat));

            var rows = sales
                .OrderBy(s => s.Timestamp)
                .Select(s =>
                {
                    var vat = vatBySale.TryGetValue(s.Id, out var v) ? v : 0m;
                    return new SalesJournalItem(s.Id, s.Timestamp, s.CustomerName, s.PaymentMethod, s.Ttc - vat, vat, s.Ttc);
                })
                .ToList();

            return Results.Ok(rows);
        }).RequireAuthorization();

        // Journal des achats — supplier receipts with HT / TVA déductible / TTC,
        // substantiating the deductible VAT on the declaration.
        app.MapGet("/api/companies/{companyId:guid}/reports/purchases-journal", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var entries = db.StockMovements.Where(m =>
                m.Type == StockMovementType.Entry && m.BatchId != null && m.Product!.CompanyId == companyId);
            if (locationId is not null) entries = entries.Where(m => m.LocationId == locationId);
            if (from is not null) entries = entries.Where(m => m.Timestamp >= from.Value.Date);
            if (to is not null) entries = entries.Where(m => m.Timestamp < to.Value.Date.AddDays(1));

            var rows = await entries
                .OrderBy(m => m.Timestamp)
                .Select(m => new
                {
                    m.Id,
                    m.Timestamp,
                    ProductName = m.Product!.Name,
                    BatchNumber = m.Batch!.BatchNumber,
                    SupplierName = m.Product.Supplier != null ? m.Product.Supplier.Name : null,
                    Ttc = m.QuantityInBaseUnits * m.Batch.PurchasePricePerBaseUnit,
                    Vat = m.QuantityInBaseUnits * m.Batch.PurchasePricePerBaseUnit * m.Batch.PurchaseVatRatePercent / (100m + m.Batch.PurchaseVatRatePercent),
                })
                .ToListAsync();

            var items = rows
                .Select(r => new PurchasesJournalItem(r.Id, r.Timestamp, r.ProductName, r.BatchNumber, r.SupplierName, r.Ttc - r.Vat, r.Vat, r.Ttc))
                .ToList();

            return Results.Ok(items);
        }).RequireAuthorization();

        // Cash book (livre de caisse) — cash-register shifts over the period.
        app.MapGet("/api/companies/{companyId:guid}/reports/cash-book", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictReportsAndFullSales);
            if (restricted is not null) return restricted;

            var shifts = db.CashRegisterShifts.Where(s => s.CompanyId == companyId);
            if (locationId is not null) shifts = shifts.Where(s => s.LocationId == locationId);
            if (from is not null) shifts = shifts.Where(s => s.OpenedAt >= from.Value.Date);
            if (to is not null) shifts = shifts.Where(s => s.OpenedAt < to.Value.Date.AddDays(1));

            var items = await shifts
                .OrderByDescending(s => s.OpenedAt)
                .Select(s => new CashBookItem(
                    s.Id, s.OpenedAt, s.ClosedAt, s.OpenedByUser!.Name,
                    s.OpeningCashAmount,
                    (s.ExpectedCashAmount ?? s.OpeningCashAmount) - s.OpeningCashAmount,
                    s.ExpectedCashAmount, s.ClosingCashAmount, s.Discrepancy))
                .ToListAsync();

            return Results.Ok(items);
        }).RequireAuthorization();
    }
}
