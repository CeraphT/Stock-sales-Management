using Microsoft.EntityFrameworkCore;
using Npgsql;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record PackagingLevelInfo(Guid Id, string UnitName, int QuantityInBaseUnits, decimal UnitPrice);

public record ProductSearchResult(
    Guid ProductId,
    string Name,
    string? Barcode,
    decimal SalePrice,
    string StockStatus,
    IEnumerable<PackagingLevelInfo> PackagingLevels
);

public record StockAvailabilityResponse(
    Guid ProductId,
    string Name,
    string? Barcode,
    decimal SalePrice,          // base-unit price, needed by any caller adding this product to a cart
    int TotalBaseUnitsAvailable,
    string DisplayQuantity,     // e.g. "2 boxes + 4 loose capsules" (Section 17.3)
    string StockStatus,         // "in_stock" | "low_stock" | "out_of_stock"
    DateTime? EarliestExpiry,
    IEnumerable<PackagingLevelInfo> PackagingLevels
);

// Product catalog management (create/edit) — distinct from PackagingLevelInfo
// above, which resolves SalePriceOverride to a display price. An edit form
// needs the raw nullable override so "inherits the product price" stays
// distinguishable from "explicitly priced at X".
public record PackagingLevelRequest(string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);

public record ProductRequest(
    string Name, string? Barcode, Guid? CategoryId, Guid? SupplierId,
    decimal PurchasePrice, decimal SalePrice, int LowStockThreshold,
    decimal? TaxRateOverridePercent, bool IsFavorite,
    List<PackagingLevelRequest>? PackagingLevels
);

public record PackagingLevelDetail(Guid Id, string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);

public record ProductDetailResponse(
    Guid Id, string Name, string? Barcode, Guid? CategoryId, string? CategoryName, Guid? SupplierId, string? SupplierName,
    decimal PurchasePrice, decimal SalePrice, bool IsFavorite, bool IsActive, int LowStockThreshold,
    decimal? TaxRateOverridePercent, List<PackagingLevelDetail> PackagingLevels
);

// Section 3.4 — restock suggestions for the "Nouvelle commande" supplier-first
// flow: once a supplier is picked, surface that supplier's own products that
// are currently at or below their low-stock threshold at this location,
// instead of making the cashier search product-by-product from memory.
public record RestockSuggestionItem(Guid ProductId, string Name, int CurrentStock, int LowStockThreshold, int SuggestedQuantity, decimal EstimatedUnitCost);

public record ProductCatalogItem(Guid Id, string Name, string? Barcode, string? CategoryName, decimal SalePrice, bool IsFavorite, bool IsActive, string StockStatus, DateTime? EarliestExpiry);

public record ProductCatalogPageResponse(List<ProductCatalogItem> Items, bool HasMore);

public static class ProductEndpoints
{
    // Search-as-you-type results are capped so the cashier gets a short,
    // scannable list rather than dumping the whole catalog at them.
    private const int MaxSearchResults = 20;

    public static void MapProductEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/products");

        // POS cart search (typeahead by partial name/barcode) — returns
        // multiple matches, unlike /availability below which is a single
        // exact-lookup. Includes PackagingLevels so a tapped result can go
        // straight to "pick packaging level -> add to cart" without a second
        // lookup, since a second lookup keyed by name isn't guaranteed to
        // resolve back to the same product the cashier tapped.
        group.MapGet("/", async (Guid companyId, string? search, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(search))
                return Results.Ok(Array.Empty<ProductSearchResult>());

            var products = await db.Products
                .Include(p => p.PackagingLevels)
                .Include(p => p.Batches)
                .Where(p => p.CompanyId == companyId && p.IsActive &&
                    (EF.Functions.ILike(p.Name, $"%{search}%") ||
                     (p.Barcode != null && EF.Functions.ILike(p.Barcode, $"%{search}%"))))
                .OrderBy(p => p.Name)
                .Take(MaxSearchResults)
                .ToListAsync();

            var results = products.Select(product =>
            {
                var totalBaseUnits = product.Batches.Sum(b => b.QuantityInBaseUnits);
                var levels = product.PackagingLevels.Select(l => new PackagingLevelInfo(
                    l.Id,
                    l.UnitName,
                    l.QuantityInBaseUnits,
                    l.SalePriceOverride ?? product.SalePrice * l.QuantityInBaseUnits
                ));

                return new ProductSearchResult(
                    product.Id, product.Name, product.Barcode, product.SalePrice,
                    ComputeStockStatus(totalBaseUnits, product.LowStockThreshold), levels);
            });

            return Results.Ok(results);
        }).RequireAuthorization();

        // Section 17 — Stock Availability Check. Deliberately read-only and
        // separate from any sales-cart endpoint (Section 17.1): this answers
        // "do we have it, and how much?" without touching a Sale at all.
        group.MapGet("/availability", async (Guid companyId, string query, PharmaStockDbContext db) =>
        {
            var product = await db.Products
                .Include(p => p.PackagingLevels)
                .Include(p => p.Batches)
                .Where(p => p.CompanyId == companyId && p.IsActive &&
                    (p.Barcode == query || p.Name.Contains(query)))
                .FirstOrDefaultAsync();

            if (product is null)
                return Results.NotFound(new { message = "Aucun produit correspondant." });

            var totalBaseUnits = product.Batches.Sum(b => b.QuantityInBaseUnits);
            var earliestExpiry = product.Batches
                .Where(b => b.ExpiryDate.HasValue && b.QuantityInBaseUnits > 0)
                .OrderBy(b => b.ExpiryDate)
                .Select(b => b.ExpiryDate)
                .FirstOrDefault();

            var status = ComputeStockStatus(totalBaseUnits, product.LowStockThreshold);

            var display = FormatDisplayQuantity(totalBaseUnits, product.PackagingLevels
                .OrderByDescending(l => l.QuantityInBaseUnits).ToList());

            var levels = product.PackagingLevels.Select(l => new PackagingLevelInfo(
                l.Id,
                l.UnitName,
                l.QuantityInBaseUnits,
                l.SalePriceOverride ?? product.SalePrice * l.QuantityInBaseUnits
            ));

            return Results.Ok(new StockAvailabilityResponse(
                product.Id, product.Name, product.Barcode, product.SalePrice,
                totalBaseUnits, display, status, earliestExpiry, levels));
        });

        // Catalog management — paginated browse, unlike the POS typeahead
        // above which deliberately returns nothing on an empty search term.
        // stockStatus/favoritesOnly/expiringSoon/expired back the filter
        // panel on ProductCatalogPage (Section: product filtering).
        // archivedOnly flips the base scope to archived products instead of
        // active ones — it's how the "manage archives" view is built, rather
        // than a separate endpoint, so search/pagination/every other filter
        // keeps working identically in both scopes.
        group.MapGet("/catalog", async (
            Guid companyId, string? search, int? page,
            string[]? stockStatus, bool? favoritesOnly, bool? expiringSoon, bool? expired, bool? archivedOnly,
            PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var pageNumber = page is > 0 ? page.Value : 1;

            var query = db.Products.Where(p => p.CompanyId == companyId && p.IsActive != (archivedOnly == true));
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(p =>
                    EF.Functions.ILike(p.Name, $"%{search}%") ||
                    (p.Barcode != null && EF.Functions.ILike(p.Barcode, $"%{search}%")));
            }

            // TotalStock/EarliestExpiry are computed once here so the filters
            // below can reference them directly (still translates to SQL,
            // and filtering happens before Skip/Take so pagination stays correct).
            var projected = query.Select(p => new
            {
                p.Id, p.Name, p.Barcode, p.SalePrice, p.IsFavorite, p.IsActive, p.LowStockThreshold,
                CategoryName = p.Category != null ? p.Category.Name : null,
                TotalStock = p.Batches.Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
                EarliestExpiry = p.Batches
                    .Where(b => b.ExpiryDate.HasValue && b.QuantityInBaseUnits > 0)
                    .OrderBy(b => b.ExpiryDate)
                    .Select(b => b.ExpiryDate)
                    .FirstOrDefault()
            });

            if (favoritesOnly == true)
                projected = projected.Where(p => p.IsFavorite);

            // Only a genuine subset (1 or 2 of the 3) narrows the results —
            // none selected or all 3 selected both mean "show everything".
            var statuses = stockStatus?.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
            if (statuses is { Count: > 0 and < 3 })
            {
                projected = projected.Where(p =>
                    (statuses.Contains("out_of_stock") && p.TotalStock <= 0) ||
                    (statuses.Contains("low_stock") && p.TotalStock > 0 && p.TotalStock <= p.LowStockThreshold) ||
                    (statuses.Contains("in_stock") && p.TotalStock > p.LowStockThreshold));
            }

            if (expiringSoon == true || expired == true)
            {
                var today = DateTime.UtcNow.Date;
                var soonCutoff = today.AddDays(30);
                projected = projected.Where(p =>
                    (expired == true && p.EarliestExpiry != null && p.EarliestExpiry < today) ||
                    (expiringSoon == true && p.EarliestExpiry != null && p.EarliestExpiry >= today && p.EarliestExpiry <= soonCutoff));
            }

            var products = await projected
                .OrderBy(p => p.Name)
                .Skip((pageNumber - 1) * CatalogPageSize)
                .Take(CatalogPageSize + 1)
                .ToListAsync();

            var items = products
                .Select(p => new ProductCatalogItem(
                    p.Id, p.Name, p.Barcode, p.CategoryName, p.SalePrice, p.IsFavorite, p.IsActive,
                    ComputeStockStatus(p.TotalStock, p.LowStockThreshold), p.EarliestExpiry))
                .ToList();

            var hasMore = items.Count > CatalogPageSize;
            return Results.Ok(new ProductCatalogPageResponse(items.Take(CatalogPageSize).ToList(), hasMore));
        }).RequireAuthorization();

        // Backs the packaging-unit-name picker on the product form — just the
        // distinct names already used across the company's products, not a
        // managed entity (no rename/delete use case, unlike Category).
        group.MapGet("/packaging-unit-names", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var names = await db.ProductPackagingLevels
                .Where(l => l.Product!.CompanyId == companyId)
                .Select(l => l.UnitName)
                .Distinct()
                .OrderBy(n => n)
                .ToListAsync();

            return Results.Ok(names);
        }).RequireAuthorization();

        // Section 3.4 — backs the restock-suggestion list on the "Nouvelle
        // commande" screen: once a supplier is picked, show that supplier's
        // own products currently at/under their low-stock threshold at this
        // location, so the cashier doesn't have to search product-by-product
        // from memory. SuggestedQuantity replenishes past the threshold
        // (not just up to it) so the same order doesn't need repeating the
        // next day — purely a starting point, editable on the create form.
        group.MapGet("/restock-suggestions", async (Guid companyId, Guid supplierId, Guid locationId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var products = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive && p.SupplierId == supplierId)
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.LowStockThreshold,
                    p.PurchasePrice,
                    CurrentStock = p.Batches.Where(b => b.LocationId == locationId).Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
                })
                .ToListAsync();

            var suggestions = products
                .Where(p => p.CurrentStock <= p.LowStockThreshold)
                .OrderBy(p => p.CurrentStock)
                .Select(p => new RestockSuggestionItem(
                    p.Id, p.Name, p.CurrentStock, p.LowStockThreshold,
                    Math.Max(p.LowStockThreshold * 2 - p.CurrentStock, 1),
                    p.PurchasePrice))
                .ToList();

            return Results.Ok(suggestions);
        }).RequireAuthorization();

        group.MapGet("/{productId:guid}", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var product = await db.Products
                .Include(p => p.PackagingLevels)
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);

            return product is null ? Results.NotFound(new { message = "Produit introuvable." }) : Results.Ok(ToDetailResponse(product));
        }).RequireAuthorization();

        group.MapPost("/", async (Guid companyId, ProductRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du produit est requis." });

            var product = new Product
            {
                CompanyId = companyId,
                Name = request.Name,
                Barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode,
                CategoryId = request.CategoryId,
                SupplierId = request.SupplierId,
                PurchasePrice = request.PurchasePrice,
                SalePrice = request.SalePrice,
                LowStockThreshold = request.LowStockThreshold,
                TaxRateOverridePercent = request.TaxRateOverridePercent,
                IsFavorite = request.IsFavorite,
            };
            foreach (var level in ApplyPackagingLevels(product, request.PackagingLevels))
                product.PackagingLevels.Add(level);

            db.Products.Add(product);
            await db.SaveChangesAsync();

            if (product.CategoryId.HasValue)
                product.Category = await db.Categories.FindAsync(product.CategoryId.Value);
            if (product.SupplierId.HasValue)
                product.Supplier = await db.Suppliers.FindAsync(product.SupplierId.Value);

            return Results.Created($"/api/companies/{companyId}/products/{product.Id}", ToDetailResponse(product));
        }).RequireAuthorization();

        group.MapPut("/{productId:guid}", async (Guid companyId, Guid productId, ProductRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du produit est requis." });

            var product = await db.Products
                .Include(p => p.PackagingLevels)
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });

            product.Name = request.Name;
            product.Barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode;
            product.CategoryId = request.CategoryId;
            product.SupplierId = request.SupplierId;
            product.PurchasePrice = request.PurchasePrice;
            product.SalePrice = request.SalePrice;
            product.LowStockThreshold = request.LowStockThreshold;
            product.TaxRateOverridePercent = request.TaxRateOverridePercent;
            product.IsFavorite = request.IsFavorite;

            // Matched by UnitName rather than full delete-then-recreate: a level
            // that's still present in the request keeps its existing Id, so any
            // SaleLine.PackagingLevelId (Restrict delete) pointing at it stays
            // valid. Previously every save deleted and recreated every level
            // with a fresh Id regardless of whether it changed, which meant
            // saving *any* edit to a product that had ever sold through a
            // packaging level (e.g. "Boîte") threw a foreign-key violation and
            // blocked the whole save — including edits unrelated to packaging.
            // Only a level genuinely removed from the request is deleted now,
            // and that can still legitimately fail if it has sale history —
            // caught below with a friendly message instead of a raw 500.
            var incomingLevels = request.PackagingLevels ?? new List<PackagingLevelRequest>();
            var existingLevels = product.PackagingLevels.ToList();
            var matchedIds = new HashSet<Guid>();

            foreach (var levelRequest in incomingLevels)
            {
                var existing = existingLevels.FirstOrDefault(l =>
                    !matchedIds.Contains(l.Id) && string.Equals(l.UnitName, levelRequest.UnitName, StringComparison.OrdinalIgnoreCase));

                if (existing is not null)
                {
                    existing.QuantityInBaseUnits = levelRequest.QuantityInBaseUnits;
                    existing.SalePriceOverride = levelRequest.SalePriceOverride;
                    matchedIds.Add(existing.Id);
                }
                else
                {
                    db.ProductPackagingLevels.Add(new ProductPackagingLevel
                    {
                        ProductId = product.Id,
                        UnitName = levelRequest.UnitName,
                        QuantityInBaseUnits = levelRequest.QuantityInBaseUnits,
                        SalePriceOverride = levelRequest.SalePriceOverride,
                    });
                }
            }

            db.ProductPackagingLevels.RemoveRange(existingLevels.Where(l => !matchedIds.Contains(l.Id)));

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsForeignKeyViolation(ex))
            {
                return Results.Conflict(new { message = "Un niveau d'emballage retiré est utilisé dans des ventes passées et ne peut pas être supprimé." });
            }

            product.PackagingLevels = await db.ProductPackagingLevels.Where(l => l.ProductId == product.Id).ToListAsync();

            // The Category/Supplier navigations loaded above may now be stale —
            // either FK could have changed to a different row or to null — so
            // both are explicitly re-fetched rather than trusting the
            // pre-update reference.
            product.Category = product.CategoryId.HasValue ? await db.Categories.FindAsync(product.CategoryId.Value) : null;
            product.Supplier = product.SupplierId.HasValue ? await db.Suppliers.FindAsync(product.SupplierId.Value) : null;

            return Results.Ok(ToDetailResponse(product));
        }).RequireAuthorization();

        // Soft delete only — Sale/StockMovement/Batch all reference this
        // product's Id with Restrict delete behavior, so a hard delete would
        // either be blocked by the DB or orphan that history. Archiving an
        // already-archived product is a no-op success, not an error.
        group.MapDelete("/{productId:guid}", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });

            product.IsActive = false;
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).RequireAuthorization();

        // Restoring an already-active product is a no-op success, mirroring
        // the delete endpoint's idempotence.
        group.MapPost("/{productId:guid}/restore", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });

            product.IsActive = true;
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).RequireAuthorization();
    }

    private const int CatalogPageSize = 20;

    private static List<ProductPackagingLevel> ApplyPackagingLevels(Product product, List<PackagingLevelRequest>? levels) =>
        (levels ?? new List<PackagingLevelRequest>())
            .Select(level => new ProductPackagingLevel
            {
                ProductId = product.Id,
                UnitName = level.UnitName,
                QuantityInBaseUnits = level.QuantityInBaseUnits,
                SalePriceOverride = level.SalePriceOverride,
            })
            .ToList();

    private static ProductDetailResponse ToDetailResponse(Product product) => new(
        product.Id, product.Name, product.Barcode, product.CategoryId, product.Category?.Name, product.SupplierId, product.Supplier?.Name,
        product.PurchasePrice, product.SalePrice, product.IsFavorite, product.IsActive, product.LowStockThreshold,
        product.TaxRateOverridePercent,
        product.PackagingLevels.Select(l => new PackagingLevelDetail(l.Id, l.UnitName, l.QuantityInBaseUnits, l.SalePriceOverride)).ToList()
    );

    private static bool IsForeignKeyViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation };

    private static string ComputeStockStatus(int totalBaseUnits, int lowStockThreshold) =>
        totalBaseUnits <= 0
            ? "out_of_stock"
            : totalBaseUnits <= lowStockThreshold
                ? "low_stock"
                : "in_stock";

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
