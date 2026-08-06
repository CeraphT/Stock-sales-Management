using Microsoft.EntityFrameworkCore;
using Npgsql;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;
using PharmaStock.Infrastructure.Services;

namespace PharmaStock.Api.Services;

public record PackagingLevelInfo(Guid Id, string UnitName, int QuantityInBaseUnits, decimal UnitPrice);

public record ProductSearchResult(
    Guid ProductId,
    string Name,
    string? Barcode,
    decimal SalePrice,
    string StockStatus,
    IEnumerable<PackagingLevelInfo> PackagingLevels,
    bool SellByMeasure = false,
    string? MeasureUnit = null,
    int UnitsPerMeasure = 1,
    bool SerialTracked = false,
    string? VariantName = null,
    Guid? ParentProductId = null,
    bool HasVariants = false
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
    List<PackagingLevelRequest>? PackagingLevels,
    bool SellByMeasure = false, string? MeasureUnit = null, int UnitsPerMeasure = 1,
    bool SerialTracked = false, string? Manufacturer = null
);

public record PackagingLevelDetail(Guid Id, string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);

public record ProductDetailResponse(
    Guid Id, string Name, string? Barcode, Guid? CategoryId, string? CategoryName, Guid? SupplierId, string? SupplierName,
    decimal PurchasePrice, decimal SalePrice, bool IsFavorite, bool IsActive, int LowStockThreshold,
    decimal? TaxRateOverridePercent, List<PackagingLevelDetail> PackagingLevels,
    bool SellByMeasure = false, string? MeasureUnit = null, int UnitsPerMeasure = 1,
    bool SerialTracked = false,
    string? VariantName = null, Guid? ParentProductId = null, bool HasVariants = false,
    bool IsAssembly = false, string? Manufacturer = null
);

// Section 3.4 — restock suggestions for the "Nouvelle commande" supplier-first
// flow: once a supplier is picked, surface that supplier's own products that
// are currently at or below their low-stock threshold at this location,
// instead of making the cashier search product-by-product from memory.
public record RestockSuggestionItem(Guid ProductId, string Name, int CurrentStock, int LowStockThreshold, int SuggestedQuantity, decimal EstimatedUnitCost);

public record ProductCatalogItem(Guid Id, string Name, string? Barcode, string? CategoryName, decimal SalePrice, bool IsFavorite, bool IsActive, string StockStatus, DateTime? EarliestExpiry);

public record ProductCatalogPageResponse(List<ProductCatalogItem> Items, bool HasMore);

public record CreateVariantsRequest(List<string> Labels);

// ── Assembly / bill-of-materials ─────────────────────────────────────────────
public record BomLineRequest(Guid ComponentProductId, int QuantityInBaseUnits);
public record BomLineResponse(Guid ComponentProductId, string ComponentName, int QuantityInBaseUnits, int ComponentStockAvailable);
public record SetBomRequest(List<BomLineRequest> Lines);
public record BuildAssemblyRequest(Guid LocationId, int Quantity, string BatchNumber, DateTime? ExpiryDate);

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
                // Exclude variant-parent headers — they hold no stock and are
                // never sold directly; only their individual variant rows are.
                .Where(p => p.CompanyId == companyId && p.IsActive && !p.HasVariants &&
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
                    ComputeStockStatus(totalBaseUnits, product.LowStockThreshold), levels,
                    product.SellByMeasure, product.MeasureUnit, product.UnitsPerMeasure, product.SerialTracked,
                    product.VariantName, product.ParentProductId, product.HasVariants);
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

            // Variant children are managed from their parent's edit screen, so
            // they're kept out of the top-level catalog list (which shows the
            // parent grouping header instead).
            var query = db.Products.Where(p => p.CompanyId == companyId && p.IsActive != (archivedOnly == true) && p.ParentProductId == null);
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

        // Variant rows for a parent product (size/colour). Each is a full child
        // Product with its own stock/barcode/price, so the whole engine reuses.
        group.MapGet("/{productId:guid}/variants", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var variants = await db.Products
                .Include(p => p.PackagingLevels).Include(p => p.Category).Include(p => p.Supplier)
                .Where(p => p.CompanyId == companyId && p.ParentProductId == productId)
                .OrderBy(p => p.VariantName)
                .ToListAsync();
            return Results.Ok(variants.Select(ToDetailResponse).ToList());
        }).RequireAuthorization();

        // Bulk-create variant rows from a list of labels (e.g. ["S","M","L"]).
        // Each clones the parent's category/supplier/prices/tax/tracking flags;
        // Name becomes "Parent — label". Existing labels are skipped (idempotent).
        group.MapPost("/{productId:guid}/variants", async (Guid companyId, Guid productId, CreateVariantsRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var parent = await db.Products.FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (parent is null)
                return Results.NotFound(new { message = "Produit introuvable." });
            if (parent.ParentProductId is not null)
                return Results.BadRequest(new { message = "Un variant ne peut pas avoir ses propres variants." });

            var labels = (request.Labels ?? new List<string>())
                .Select(l => l?.Trim() ?? "")
                .Where(l => l.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (labels.Count == 0)
                return Results.BadRequest(new { message = "Indiquez au moins un libellé de variant." });

            var existing = await db.Products
                .Where(p => p.ParentProductId == productId)
                .Select(p => p.VariantName!)
                .ToListAsync();
            var existingSet = existing.Select(e => e.ToLowerInvariant()).ToHashSet();

            foreach (var label in labels)
            {
                if (existingSet.Contains(label.ToLowerInvariant())) continue;
                db.Products.Add(new Product
                {
                    CompanyId = companyId,
                    Name = $"{parent.Name} — {label}",
                    VariantName = label,
                    ParentProductId = parent.Id,
                    CategoryId = parent.CategoryId,
                    SupplierId = parent.SupplierId,
                    PurchasePrice = parent.PurchasePrice,
                    SalePrice = parent.SalePrice,
                    TaxRateOverridePercent = parent.TaxRateOverridePercent,
                    LowStockThreshold = parent.LowStockThreshold,
                    SerialTracked = parent.SerialTracked,
                    SellByMeasure = parent.SellByMeasure,
                    MeasureUnit = parent.MeasureUnit,
                    UnitsPerMeasure = parent.UnitsPerMeasure,
                });
            }
            parent.HasVariants = true;
            await db.SaveChangesAsync();

            var all = await db.Products
                .Include(p => p.PackagingLevels).Include(p => p.Category).Include(p => p.Supplier)
                .Where(p => p.ParentProductId == productId)
                .OrderBy(p => p.VariantName)
                .ToListAsync();
            return Results.Ok(all.Select(ToDetailResponse).ToList());
        }).RequireAuthorization();

        // Bill of materials for an assembly product.
        group.MapGet("/{productId:guid}/bom", async (Guid companyId, Guid productId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var lines = await db.BillOfMaterialLines
                .Where(b => b.AssemblyProductId == productId && b.AssemblyProduct!.CompanyId == companyId)
                .Select(b => new BomLineResponse(
                    b.ComponentProductId,
                    b.ComponentProduct!.Name,
                    b.QuantityInBaseUnits,
                    b.ComponentProduct!.Batches.Sum(bt => bt.QuantityInBaseUnits)))
                .ToListAsync();
            return Results.Ok(lines);
        }).RequireAuthorization();

        // Replace an assembly's BOM. Empty list clears it (and unmarks IsAssembly).
        group.MapPut("/{productId:guid}/bom", async (Guid companyId, Guid productId, SetBomRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var product = await db.Products
                .Include(p => p.BillOfMaterials)
                .FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null)
                return Results.NotFound(new { message = "Produit introuvable." });

            var lines = (request.Lines ?? new List<BomLineRequest>())
                .Where(l => l.QuantityInBaseUnits > 0)
                .GroupBy(l => l.ComponentProductId).Select(g => g.First()) // de-dupe by component
                .ToList();
            if (lines.Any(l => l.ComponentProductId == productId))
                return Results.BadRequest(new { message = "Un produit ne peut pas être son propre composant." });

            var componentIds = lines.Select(l => l.ComponentProductId).ToList();
            var validCount = await db.Products.CountAsync(p => componentIds.Contains(p.Id) && p.CompanyId == companyId);
            if (validCount != componentIds.Count)
                return Results.BadRequest(new { message = "Un ou plusieurs composants sont introuvables." });

            db.BillOfMaterialLines.RemoveRange(product.BillOfMaterials);
            foreach (var l in lines)
                db.BillOfMaterialLines.Add(new BillOfMaterialLine
                {
                    AssemblyProductId = productId,
                    ComponentProductId = l.ComponentProductId,
                    QuantityInBaseUnits = l.QuantityInBaseUnits,
                });
            product.IsAssembly = lines.Count > 0;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        // Build N units of an assembly: FEFO-deduct each component and add
        // finished-goods stock of the assembly as a new batch. Atomic.
        group.MapPost("/{productId:guid}/build", async (
            Guid companyId, Guid productId, BuildAssemblyRequest request,
            PharmaStockDbContext db, StockDeductionService deductor, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            if (request.Quantity <= 0)
                return Results.BadRequest(new { message = "La quantité à produire doit être positive." });
            if (string.IsNullOrWhiteSpace(request.BatchNumber))
                return Results.BadRequest(new { message = "Le numéro de lot est requis." });

            var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
            if (company is null) return Results.NotFound(new { message = "Entreprise introuvable." });
            if (company.ExpiryTrackingEnabled && request.ExpiryDate is null)
                return Results.BadRequest(new { message = "La date d'expiration est requise." });

            var product = await db.Products
                .Include(p => p.BillOfMaterials)
                .FirstOrDefaultAsync(p => p.Id == productId && p.CompanyId == companyId);
            if (product is null) return Results.NotFound(new { message = "Produit introuvable." });
            if (!product.IsAssembly || product.BillOfMaterials.Count == 0)
                return Results.BadRequest(new { message = "Ce produit n'a pas de nomenclature (composants) à assembler." });

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId);
            if (!locationExists) return Results.NotFound(new { message = "Emplacement introuvable." });

            await using var transaction = await db.Database.BeginTransactionAsync();
            try
            {
                foreach (var bom in product.BillOfMaterials)
                {
                    var need = bom.QuantityInBaseUnits * request.Quantity;
                    List<StockDeductionResult> deductions;
                    try
                    {
                        deductions = await deductor.DeductFefoAsync(bom.ComponentProductId, request.LocationId, need);
                    }
                    catch (InsufficientStockException ex)
                    {
                        await transaction.RollbackAsync();
                        var compName = await db.Products.Where(p => p.Id == bom.ComponentProductId).Select(p => p.Name).FirstOrDefaultAsync();
                        return Results.Conflict(new { message = $"Stock insuffisant du composant « {compName} » : {ex.Requested} demandé(s), {ex.Available} disponible(s)." });
                    }
                    foreach (var d in deductions)
                        db.StockMovements.Add(new StockMovement
                        {
                            ProductId = bom.ComponentProductId,
                            BatchId = d.BatchId,
                            LocationId = request.LocationId,
                            Type = StockMovementType.AssemblyConsumption,
                            QuantityInBaseUnits = -d.QuantityInBaseUnits,
                            UserId = userId.Value,
                        });
                }

                // Finished-goods stock: a new batch of the assembly product.
                var batch = new Batch
                {
                    ProductId = productId,
                    LocationId = request.LocationId,
                    BatchNumber = request.BatchNumber.Trim(),
                    ExpiryDate = request.ExpiryDate,
                    QuantityInBaseUnits = request.Quantity,
                    PurchasePricePerBaseUnit = product.PurchasePrice,
                    PurchaseVatRatePercent = company.DefaultTaxRatePercent,
                };
                db.Batches.Add(batch);
                db.StockMovements.Add(new StockMovement
                {
                    ProductId = productId,
                    BatchId = batch.Id,
                    LocationId = request.LocationId,
                    Type = StockMovementType.AssemblyOutput,
                    QuantityInBaseUnits = request.Quantity,
                    UserId = userId.Value,
                });

                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Ok(new BatchResponse(batch.Id, batch.LocationId, batch.BatchNumber, batch.ExpiryDate,
                    batch.QuantityInBaseUnits, batch.PurchasePricePerBaseUnit, batch.ReceivedAt));
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }).RequireAuthorization();

        group.MapPost("/", async (Guid companyId, ProductRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

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
                SellByMeasure = request.SellByMeasure,
                MeasureUnit = request.SellByMeasure ? request.MeasureUnit : null,
                UnitsPerMeasure = request.SellByMeasure && request.UnitsPerMeasure > 0 ? request.UnitsPerMeasure : 1,
                SerialTracked = request.SerialTracked,
                Manufacturer = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim(),
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

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

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
            product.SellByMeasure = request.SellByMeasure;
            product.MeasureUnit = request.SellByMeasure ? request.MeasureUnit : null;
            product.UnitsPerMeasure = request.SellByMeasure && request.UnitsPerMeasure > 0 ? request.UnitsPerMeasure : 1;
            product.SerialTracked = request.SerialTracked;
            product.Manufacturer = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim();

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

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

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

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

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
        product.PackagingLevels.Select(l => new PackagingLevelDetail(l.Id, l.UnitName, l.QuantityInBaseUnits, l.SalePriceOverride)).ToList(),
        product.SellByMeasure, product.MeasureUnit, product.UnitsPerMeasure, product.SerialTracked,
        product.VariantName, product.ParentProductId, product.HasVariants,
        product.IsAssembly, product.Manufacturer
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
