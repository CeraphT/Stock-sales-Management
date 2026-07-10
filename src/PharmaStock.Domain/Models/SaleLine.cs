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

    /// <summary>Section 18.3 — snapshotted at sale time from
    /// Product.TaxRateOverridePercent ?? Company.DefaultTaxRatePercent, so a
    /// later company/product rate change never rewrites the tax on a past
    /// sale. Different lines on the same sale can carry different rates.</summary>
    public decimal TaxRatePercent { get; set; }

    /// <summary>Assumes UnitPrice is tax-inclusive (the common convention for
    /// a Cameroonian shop's sticker/shelf price — the customer pays exactly
    /// UnitPrice, VAT included), so this extracts the tax portion already
    /// baked into that price rather than adding tax on top of it. Sale.Total
    /// and checkout math are unaffected either way. This is a reporting-only
    /// assumption pending Section 18.3's note that Cameroon's DGI normalized-
    /// invoice rules "should be verified" before this is relied on for filing.</summary>
    public decimal TaxAmount => UnitPrice * QuantityInBaseUnits * TaxRatePercent / (100m + TaxRatePercent);
}
