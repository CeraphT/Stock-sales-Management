using Microsoft.EntityFrameworkCore;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record PackagingLevelInfo(string UnitName, int QuantityInBaseUnits, decimal UnitPrice);

public record StockAvailabilityResponse(
    Guid ProductId,
    string Name,
    string? Barcode,
    int TotalBaseUnitsAvailable,
    string DisplayQuantity,     // e.g. "2 boxes + 4 loose capsules" (Section 17.3)
    string StockStatus,         // "in_stock" | "low_stock" | "out_of_stock"
    DateTime? EarliestExpiry,
    IEnumerable<PackagingLevelInfo> PackagingLevels
);

public static class ProductEndpoints
{
    public static void MapProductEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/products");

        // Section 17 — Stock Availability Check. Deliberately read-only and
        // separate from any sales-cart endpoint (Section 17.1): this answers
        // "do we have it, and how much?" without touching a Sale at all.
        group.MapGet("/availability", async (Guid companyId, string query, PharmaStockDbContext db) =>
        {
            var product = await db.Products
                .Include(p => p.PackagingLevels)
                .Include(p => p.Batches)
                .Where(p => p.CompanyId == companyId &&
                    (p.Barcode == query || p.Name.Contains(query)))
                .FirstOrDefaultAsync();

            if (product is null)
                return Results.NotFound(new { message = "No matching product." });

            var totalBaseUnits = product.Batches.Sum(b => b.QuantityInBaseUnits);
            var earliestExpiry = product.Batches
                .Where(b => b.ExpiryDate.HasValue && b.QuantityInBaseUnits > 0)
                .OrderBy(b => b.ExpiryDate)
                .Select(b => b.ExpiryDate)
                .FirstOrDefault();

            var status = totalBaseUnits <= 0
                ? "out_of_stock"
                : totalBaseUnits <= product.LowStockThreshold
                    ? "low_stock"
                    : "in_stock";

            var display = FormatDisplayQuantity(totalBaseUnits, product.PackagingLevels
                .OrderByDescending(l => l.QuantityInBaseUnits).ToList());

            var levels = product.PackagingLevels.Select(l => new PackagingLevelInfo(
                l.UnitName,
                l.QuantityInBaseUnits,
                l.SalePriceOverride ?? product.SalePrice * l.QuantityInBaseUnits
            ));

            return Results.Ok(new StockAvailabilityResponse(
                product.Id, product.Name, product.Barcode,
                totalBaseUnits, display, status, earliestExpiry, levels));
        });
    }

    /// <summary>Section 15.1 / 17.3 — expresses a raw base-unit count using the
    /// product's packaging hierarchy, e.g. 204 capsules with a Box=100 and
    /// Blister=10 level becomes "2 boxes + 4 loose capsules".</summary>
    private static string FormatDisplayQuantity(
        int totalBaseUnits,
        List<Domain.Models.ProductPackagingLevel> levelsLargestFirst)
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

    /// <summary>Naive "+s" pluralization mangles common packaging unit names
    /// like "box" -> "boxs" instead of "boxes", which would show up on every
    /// receipt for boxed products. Covers the standard English sibilant-ending
    /// case (box/es, dish/es); anything else falls back to "+s".</summary>
    private static string Pluralize(string word, int count)
    {
        if (count == 1) return word;
        return word.EndsWith('s') || word.EndsWith('x') || word.EndsWith("ch") || word.EndsWith("sh")
            ? $"{word}es"
            : $"{word}s";
    }
}
