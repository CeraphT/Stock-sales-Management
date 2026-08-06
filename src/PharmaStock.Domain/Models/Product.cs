namespace PharmaStock.Domain.Models;

/// <summary>A product in the catalog (Section 3.2). Stock quantities are always
/// tracked at the smallest packaging unit internally (Section 15.1) — this
/// entity itself does not hold a quantity; see Batch and StockMovement.</summary>
public class Product : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Barcode { get; set; }

    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }

    public decimal PurchasePrice { get; set; }

    /// <summary>Default sale price at the base (smallest) unit. Higher packaging
    /// levels (see PackagingLevels) can override this per level.</summary>
    public decimal SalePrice { get; set; }

    public Guid? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    public bool IsFavorite { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public int LowStockThreshold { get; set; } = 0;

    // ── Sell-by-measure (weight/length/volume) ──────────────────────────────
    // A measure product's BASE UNIT is a fraction of the display unit (e.g. base
    // = gram, display = kg, UnitsPerMeasure = 1000), so the existing integer
    // base-unit ledger + pricing engine work unchanged: stock and sale quantities
    // are whole base units (grams), SalePrice/PurchasePrice are per base unit,
    // and the UI presents them as the measure unit (kg). No engine change.
    public bool SellByMeasure { get; set; } = false;
    /// <summary>Display unit shown to the user (e.g. "kg", "m", "L"). Null unless SellByMeasure.</summary>
    public string? MeasureUnit { get; set; }
    /// <summary>Base units per one display unit (e.g. 1000 grams per kg). Used only to convert
    /// for display/entry; the stored quantities and prices are always per base unit.</summary>
    public int UnitsPerMeasure { get; set; } = 1;

    // ── Variants (size / colour) ─────────────────────────────────────────────
    // A variant is a full child Product row (its own barcode, price, stock,
    // packaging, serials) linked to a parent by ParentProductId — so the entire
    // stock/POS/serial engine works per-variant unchanged. The parent row
    // (HasVariants = true) is a grouping header, not directly sellable, and is
    // excluded from POS search; only its variant rows are sold. Name on a variant
    // is the full sellable label (e.g. "T-Shirt — M / Red"); VariantName is just
    // the distinguishing part ("M / Red") for grouped display.
    public Guid? ParentProductId { get; set; }
    public Product? ParentProduct { get; set; }
    public string? VariantName { get; set; }
    public bool HasVariants { get; set; } = false;

    // ── Serial / IMEI tracking ──────────────────────────────────────────────
    // A per-unit serial registry (ProductSerial) layered ON TOP of the integer
    // ledger — Batch/StockMovement/FEFO are unchanged, so a serialized product
    // still counts stock normally. When true, receiving captures one serial per
    // unit and selling requires picking specific in-stock serials.
    public bool SerialTracked { get; set; } = false;

    // ── Assembly / kits (bill of materials) ──────────────────────────────────
    // An assembly is built from component products (see BillOfMaterialLine). A
    // "build N units" action FEFO-deducts the components and adds finished-goods
    // stock of THIS product (a normal Batch), which then sells like anything
    // else — so the sales engine is untouched. IsAssembly is true whenever a BOM
    // exists; the free-text Manufacturer is an optional maker/brand label.
    public bool IsAssembly { get; set; } = false;
    public string? Manufacturer { get; set; }
    public ICollection<BillOfMaterialLine> BillOfMaterials { get; set; } = new List<BillOfMaterialLine>();

    /// <summary>Section 18.3 — null means "use Company.DefaultTaxRatePercent".
    /// Set explicitly (e.g. to 0) for a VAT-exempt product, since not every
    /// pharmaceutical item is taxed at the same rate.</summary>
    public decimal? TaxRateOverridePercent { get; set; }

    public ICollection<ProductPackagingLevel> PackagingLevels { get; set; } = new List<ProductPackagingLevel>();
    public ICollection<Batch> Batches { get; set; } = new List<Batch>();

    /// <summary>Section 6 — stamped automatically on every save, drives
    /// incremental sync pull to offline devices.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
