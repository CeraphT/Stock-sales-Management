namespace PharmaStock.Domain.Models;

/// <summary>A product in the catalog (Section 3.2). Stock quantities are always
/// tracked at the smallest packaging unit internally (Section 15.1) — this
/// entity itself does not hold a quantity; see Batch and StockMovement.</summary>
public class Product
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public string? Category { get; set; }
    public decimal PurchasePrice { get; set; }

    /// <summary>Default sale price at the base (smallest) unit. Higher packaging
    /// levels (see PackagingLevels) can override this per level.</summary>
    public decimal SalePrice { get; set; }

    public Guid? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    public bool IsFavorite { get; set; } = false;
    public int LowStockThreshold { get; set; } = 0;

    public ICollection<ProductPackagingLevel> PackagingLevels { get; set; } = new List<ProductPackagingLevel>();
    public ICollection<Batch> Batches { get; set; } = new List<Batch>();
}
