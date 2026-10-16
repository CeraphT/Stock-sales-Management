using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Starter content created with a shop (like HouseBudget's units and categories
/// created with a house). The clients build it from the business type's suggestions
/// (@stockflow/core setup/starterKit) after the owner edited them, in the shop's
/// language, so the server only validates and inserts what it is given.</summary>
public record StarterKitRequest(
    List<string>? Categories,
    List<StarterServiceRequest>? Services,
    string? DefaultSupplierName,
    List<StarterProductRequest>? DemoProducts);
public record StarterServiceRequest(string Name, string? Category);
/// <summary>A demo product, with prices per display unit (per kg for a measure product)
/// and no stock. Category is matched by name.</summary>
public record StarterProductRequest(
    string Name, string? Category, decimal PurchasePrice, decimal SalePrice,
    string? MeasureUnit = null, int UnitsPerMeasure = 1, List<PackagingLevelRequest>? PackagingLevels = null);
public record StarterKitResponse(int Categories, int Services, int Suppliers, int Products);

public static class StarterKitService
{
    private const int MaxItems = 60;

    /// <summary>Adds the kit to the context without saving (the caller saves, so a new
    /// shop and its content commit together). Never duplicates: a name that already
    /// exists in the shop (case-insensitive) is skipped, so re-applying is harmless.</summary>
    public static async Task<StarterKitResponse> ApplyAsync(PharmaStockDbContext db, Company company, StarterKitRequest kit, bool isNewCompany)
    {
        static string Key(string s) => s.Trim().ToLowerInvariant();
        static List<string> Clean(IEnumerable<string?>? names) => (names ?? [])
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n!.Trim())
            .Where(n => n.Length <= 100)
            .DistinctBy(Key)
            .Take(MaxItems)
            .ToList();

        // A brand-new company has nothing yet (and isn't saved, so it can't be queried).
        var existingCategories = isNewCompany ? [] : await db.Categories
            .Where(c => c.CompanyId == company.Id).ToListAsync();
        var existingServices = isNewCompany ? [] : await db.Services
            .Where(s => s.CompanyId == company.Id).Select(s => s.Name).ToListAsync();
        var existingSuppliers = isNewCompany ? [] : await db.Suppliers
            .Where(s => s.CompanyId == company.Id).ToListAsync();
        var existingProducts = isNewCompany ? [] : await db.Products
            .Where(p => p.CompanyId == company.Id).Select(p => p.Name).ToListAsync();

        var categoryByName = existingCategories.ToDictionary(c => Key(c.Name), c => c);
        var categoriesAdded = 0;
        Category? CategoryFor(string? name, bool create)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            if (categoryByName.TryGetValue(Key(name), out var found)) return found;
            if (!create) return null;
            var category = new Category { CompanyId = company.Id, Name = name.Trim() };
            db.Categories.Add(category);
            categoryByName[Key(name)] = category;
            categoriesAdded++;
            return category;
        }
        foreach (var name in Clean(kit.Categories)) CategoryFor(name, create: true);

        var servicesAdded = 0;
        var serviceNames = existingServices.Select(Key).ToHashSet();
        foreach (var service in (kit.Services ?? []).Where(s => !string.IsNullOrWhiteSpace(s.Name)).Take(MaxItems))
        {
            if (!serviceNames.Add(Key(service.Name))) continue;
            db.Services.Add(new Service
            {
                CompanyId = company.Id,
                Name = service.Name.Trim(),
                // Priced by the owner later: the suggestion only names the service.
                FixedPrice = 0,
                Category = string.IsNullOrWhiteSpace(service.Category) ? null : service.Category.Trim(),
                Active = true,
            });
            servicesAdded++;
        }
        if (servicesAdded > 0) company.ServicesModuleEnabled = true;

        // The catch-all supplier keeps the first receipts and products from being
        // blocked by the "a product needs a supplier" rule.
        var suppliersAdded = 0;
        Supplier? defaultSupplier = null;
        if (!string.IsNullOrWhiteSpace(kit.DefaultSupplierName))
        {
            defaultSupplier = existingSuppliers.FirstOrDefault(s => Key(s.Name) == Key(kit.DefaultSupplierName));
            if (defaultSupplier is null)
            {
                defaultSupplier = new Supplier { CompanyId = company.Id, Name = kit.DefaultSupplierName.Trim() };
                db.Suppliers.Add(defaultSupplier);
                suppliersAdded++;
            }
        }
        defaultSupplier ??= existingSuppliers.FirstOrDefault();

        var productsAdded = 0;
        var productNames = existingProducts.Select(Key).ToHashSet();
        foreach (var demo in (kit.DemoProducts ?? []).Where(p => !string.IsNullOrWhiteSpace(p.Name)).Take(20))
        {
            if (!productNames.Add(Key(demo.Name))) continue;
            // Measure products only when the shop sells by weight/measure; prices are
            // stored per base unit (per gram), the request gives them per display unit.
            var byMeasure = company.SellByMeasureEnabled && !string.IsNullOrWhiteSpace(demo.MeasureUnit) && demo.UnitsPerMeasure > 0;
            var upm = byMeasure ? demo.UnitsPerMeasure : 1;
            var product = new Product
            {
                CompanyId = company.Id,
                Name = demo.Name.Trim(),
                Category = CategoryFor(demo.Category, create: true),
                Supplier = defaultSupplier,
                PurchasePrice = Math.Max(0, demo.PurchasePrice) / upm,
                SalePrice = Math.Max(0, demo.SalePrice) / upm,
                LowStockThreshold = company.DefaultLowStockThreshold,
                SellByMeasure = byMeasure,
                MeasureUnit = byMeasure ? demo.MeasureUnit!.Trim() : null,
                UnitsPerMeasure = upm,
            };
            if (!byMeasure)
                foreach (var level in (demo.PackagingLevels ?? []).Where(l => !string.IsNullOrWhiteSpace(l.UnitName) && l.QuantityInBaseUnits > 1))
                    product.PackagingLevels.Add(new ProductPackagingLevel
                    {
                        UnitName = level.UnitName.Trim(),
                        QuantityInBaseUnits = level.QuantityInBaseUnits,
                        SalePriceOverride = level.SalePriceOverride,
                    });
            db.Products.Add(product);
            productsAdded++;
        }

        return new StarterKitResponse(categoriesAdded, servicesAdded, suppliersAdded, productsAdded);
    }
}
