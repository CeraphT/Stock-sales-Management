namespace PharmaStock.Domain.Models;

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
