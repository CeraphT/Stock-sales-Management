using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Desktop.Services;

/// <summary>Section 6 — POS read path against the local, sync-pulled catalog
/// cache instead of the network, so barcode scan/search/checkout keep
/// working with zero connectivity. Mirrors ProductEndpoints.cs's /availability
/// and / (typeahead search) handlers exactly, against the local SQLite copy
/// of Products/Batches/PackagingLevels instead of the server's Postgres data.</summary>
public class LocalCatalogQueryService
{
    private const int MaxSearchResults = 20;

    private readonly IDbContextFactory<PharmaStockDbContext> _dbFactory;

    public LocalCatalogQueryService(IDbContextFactory<PharmaStockDbContext> dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public async Task<List<LocationResponse>> GetLocationsAsync(Guid companyId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        return await db.Locations
            .Where(l => l.CompanyId == companyId)
            .Select(l => new LocationResponse(l.Id, l.Name, l.Address, l.Active))
            .ToListAsync(ct);
    }

    public async Task<CompanyResponse> GetCompanyAsync(Guid companyId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company is null)
            throw new PharmaStockApiException(404, "Entreprise introuvable localement — synchronisez avant de continuer hors-ligne.");

        return new CompanyResponse(company.Id, company.Name, company.UniqueCode, company.Currency,
            company.ServicesModuleEnabled, company.Description, company.DefaultTaxRatePercent,
            company.LoyaltyEnabled, company.LoyaltyEarnRateAmount, company.LoyaltyPointValue);
    }

    // Local, offline-safe — the customer picker lives inside PosPage
    // (the offline-critical screen), unlike SupplierPickerPage which calls
    // the live API directly since it's only ever used from purchase-order
    // creation, a management flow that already assumes connectivity.
    public async Task<List<CustomerResponse>> SearchCustomersAsync(Guid companyId, string search, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var pattern = $"%{search}%";
        var query = db.Customers.Include(c => c.LoyaltyAccount).Where(c => c.CompanyId == companyId);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c => EF.Functions.Like(c.Name, pattern) || (c.Phone != null && EF.Functions.Like(c.Phone, pattern)));

        var customers = await query.OrderBy(c => c.Name).Take(MaxSearchResults).ToListAsync(ct);
        return customers.Select(c => new CustomerResponse(
            c.Id, c.Name, c.Phone, c.CreditBalance,
            c.LoyaltyAccount?.PointsBalance ?? 0, c.LoyaltyAccount?.StoreCreditBalance ?? 0)).ToList();
    }

    public async Task<List<ProductSearchResult>> SearchProductsAsync(Guid companyId, string search, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(search))
            return new List<ProductSearchResult>();

        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var pattern = $"%{search}%";
        var products = await db.Products
            .Include(p => p.PackagingLevels)
            .Include(p => p.Batches)
            .Where(p => p.CompanyId == companyId && p.IsActive &&
                (EF.Functions.Like(p.Name, pattern) || (p.Barcode != null && EF.Functions.Like(p.Barcode, pattern))))
            .OrderBy(p => p.Name)
            .Take(MaxSearchResults)
            .ToListAsync(ct);

        return products.Select(product =>
        {
            var totalBaseUnits = product.Batches.Sum(b => b.QuantityInBaseUnits);
            var levels = product.PackagingLevels.Select(l => new PackagingLevelInfo(
                l.Id, l.UnitName, l.QuantityInBaseUnits, l.SalePriceOverride ?? product.SalePrice * l.QuantityInBaseUnits));

            return new ProductSearchResult(
                product.Id, product.Name, product.Barcode, product.SalePrice,
                ComputeStockStatus(totalBaseUnits, product.LowStockThreshold), levels);
        }).ToList();
    }

    public async Task<StockAvailabilityResponse> GetProductAvailabilityAsync(Guid companyId, string query, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var product = await db.Products
            .Include(p => p.PackagingLevels)
            .Include(p => p.Batches)
            .Where(p => p.CompanyId == companyId && p.IsActive && (p.Barcode == query || p.Name.Contains(query)))
            .FirstOrDefaultAsync(ct);

        if (product is null)
            throw new PharmaStockApiException(404, "Aucun produit correspondant.");

        var totalBaseUnits = product.Batches.Sum(b => b.QuantityInBaseUnits);
        var earliestExpiry = product.Batches
            .Where(b => b.ExpiryDate.HasValue && b.QuantityInBaseUnits > 0)
            .OrderBy(b => b.ExpiryDate)
            .Select(b => b.ExpiryDate)
            .FirstOrDefault();

        var status = ComputeStockStatus(totalBaseUnits, product.LowStockThreshold);
        var display = FormatDisplayQuantity(totalBaseUnits, product.PackagingLevels.OrderByDescending(l => l.QuantityInBaseUnits).ToList());
        var levels = product.PackagingLevels.Select(l => new PackagingLevelInfo(
            l.Id, l.UnitName, l.QuantityInBaseUnits, l.SalePriceOverride ?? product.SalePrice * l.QuantityInBaseUnits));

        return new StockAvailabilityResponse(product.Id, product.Name, product.Barcode, product.SalePrice,
            totalBaseUnits, display, status, earliestExpiry, levels);
    }

    private static string ComputeStockStatus(int totalBaseUnits, int lowStockThreshold) =>
        totalBaseUnits <= 0 ? "out_of_stock" : totalBaseUnits <= lowStockThreshold ? "low_stock" : "in_stock";

    private static string FormatDisplayQuantity(int totalBaseUnits, List<ProductPackagingLevel> levelsLargestFirst)
    {
        if (totalBaseUnits <= 0) return "0";

        var remaining = totalBaseUnits;
        var parts = new List<string>();

        foreach (var level in levelsLargestFirst)
        {
            if (level.QuantityInBaseUnits <= 0) continue;
            var count = remaining / level.QuantityInBaseUnits;
            if (count > 0)
            {
                parts.Add($"{count} {Pluralize(level.UnitName, count)}");
                remaining -= count * level.QuantityInBaseUnits;
            }
        }

        if (remaining > 0)
            parts.Add($"{remaining} {Pluralize("loose unit", remaining)}");

        return parts.Count > 0 ? string.Join(" + ", parts) : $"{totalBaseUnits}";
    }

    private static string Pluralize(string word, int count)
    {
        if (count == 1) return word;
        var lower = word.ToLowerInvariant();
        return lower.EndsWith('s') || lower.EndsWith('x') || lower.EndsWith("sh") || lower.EndsWith("ch")
            ? word + "es"
            : word + "s";
    }
}
