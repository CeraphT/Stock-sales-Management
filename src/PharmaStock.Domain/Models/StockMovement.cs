namespace PharmaStock.Domain.Models;

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

    public StockMovementType Type { get; set; }

    /// <summary>Positive for entries/returns, negative for sales/losses. Always
    /// expressed in base units regardless of which packaging level triggered it.</summary>
    public int QuantityInBaseUnits { get; set; }

    /// <summary>Required for Adjustment movements (Section 3.3) — breakage, theft, expiry, etc.</summary>
    public string? Reason { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
