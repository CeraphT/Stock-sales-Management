namespace PharmaStock.Domain.Models;

public class SaleLine
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public Guid? BatchId { get; set; }
    public Batch? Batch { get; set; }

    /// <summary>In base units regardless of which packaging level was sold —
    /// e.g. selling "1 box" of a 100-capsule box records Quantity = 100 here,
    /// while the receipt still displays "1 box" using PackagingLevelId.</summary>
    public int QuantityInBaseUnits { get; set; }

    public Guid? PackagingLevelId { get; set; }
    public ProductPackagingLevel? PackagingLevel { get; set; }

    public decimal UnitPrice { get; set; }
}
