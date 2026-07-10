namespace PharmaStock.Domain.Entities;

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

/// <summary>A supplier delivery batch/lot (Section 3.3). Stock quantity and
/// expiry are tracked here; StockMovement rows reference a batch so that
/// FEFO rotation (Section 16.1) and expiry alerts (Section 3.3) both work
/// off the same data.</summary>
public class Batch
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public string BatchNumber { get; set; } = string.Empty;
    public DateTime? ExpiryDate { get; set; }

    /// <summary>Current quantity remaining in this batch, in base units.
    /// Derived from summing StockMovement rows for this batch, but kept as a
    /// materialized column for fast reads (Section 17 availability checks).</summary>
    public int QuantityInBaseUnits { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
}

public class Supplier
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? ContactPhone { get; set; }
    public string? ContactEmail { get; set; }
}

/// <summary>Every change to stock is an immutable, timestamped movement
/// (Section 6.1) rather than a mutable balance — this is what makes two
/// offline devices safe to sync without conflicts: their movements simply
/// merge and sum, regardless of order.</summary>
public class StockMovement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public Guid? BatchId { get; set; }
    public Batch? Batch { get; set; }

    public Enums.StockMovementType Type { get; set; }

    /// <summary>Positive for entries/returns, negative for sales/losses. Always
    /// expressed in base units regardless of which packaging level triggered it.</summary>
    public int QuantityInBaseUnits { get; set; }

    /// <summary>Required for Adjustment movements (Section 3.3) — breakage, theft, expiry, etc.</summary>
    public string? Reason { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
