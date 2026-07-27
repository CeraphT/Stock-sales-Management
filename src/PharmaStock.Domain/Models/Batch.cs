namespace PharmaStock.Domain.Models;

/// <summary>A supplier delivery batch/lot (Section 3.3). Stock quantity and
/// expiry are tracked here; StockMovement rows reference a batch so that
/// FEFO rotation (Section 16.1) and expiry alerts (Section 3.3) both work
/// off the same data.</summary>
public class Batch : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    /// <summary>Section 16.6 — the branch this batch physically sits in. FEFO
    /// deduction (StockDeductionService) is scoped by this, so a sale at one
    /// location can never draw down stock actually sitting at another.</summary>
    public Guid LocationId { get; set; }
    public Location? Location { get; set; }

    public string BatchNumber { get; set; } = string.Empty;
    public DateTime? ExpiryDate { get; set; }

    /// <summary>Current quantity remaining in this batch, in base units.
    /// Derived from summing StockMovement rows for this batch, but kept as a
    /// materialized column for fast reads (Section 17 availability checks).</summary>
    public int QuantityInBaseUnits { get; set; }

    /// <summary>Section 18.3 — actual cost paid per base unit for this specific
    /// delivery, captured at receiving time. Distinct from Product.PurchasePrice
    /// (a catalog "current estimated cost" used before any stock exists): margin/
    /// COGS reports join through SaleLine.BatchId to this field for the real,
    /// historical cost of what was actually sold, not just the latest price.</summary>
    public decimal PurchasePricePerBaseUnit { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Section 6 — stamped automatically on every save, including
    /// every FEFO deduction that mutates QuantityInBaseUnits. Drives
    /// incremental sync pull to offline devices.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
