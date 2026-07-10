namespace PharmaStock.Domain.Models;

/// <summary>Section 15.1 — a nested packaging level for a product, e.g.
/// Box (100 base units) -> Blister (10 base units) -> Capsule (1 base unit,
/// the base level itself does not need a row here). Each level can carry
/// its own sale price, since loose/detail sales are commonly priced higher
/// per unit than buying the whole package.</summary>
public class ProductPackagingLevel
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public string UnitName { get; set; } = string.Empty; // e.g. "Box", "Blister strip"

    /// <summary>How many base (smallest) units this one packaging unit contains.
    /// E.g. for a "Box" level this might be 100 if the base unit is "capsule".</summary>
    public int QuantityInBaseUnits { get; set; }

    /// <summary>Sale price for one unit at this packaging level. If null, falls
    /// back to Product.SalePrice scaled by QuantityInBaseUnits.</summary>
    public decimal? SalePriceOverride { get; set; }
}
