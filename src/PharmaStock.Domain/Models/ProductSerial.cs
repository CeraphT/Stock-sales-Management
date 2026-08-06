namespace PharmaStock.Domain.Models;

/// <summary>A single serialized/IMEI physical unit of a product (electronics,
/// high-value goods). This is a per-unit registry layered on top of the integer
/// stock ledger (Batch/StockMovement) — it does NOT replace it: a serialized
/// product still has Batches and FEFO deduction like any other. Receiving a
/// serialized product captures one row per unit; selling marks the chosen rows
/// Sold and links them to the sale, so each unit's whereabouts and warranty can
/// be traced.</summary>
public class ProductSerial : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    /// <summary>Branch the unit physically sits in — scopes the POS serial picker
    /// so a sale can only pick a serial actually present at that location.</summary>
    public Guid LocationId { get; set; }
    public Location? Location { get; set; }

    /// <summary>The batch this unit came in with, so cost/expiry trace back to the
    /// same delivery the ledger deducts from.</summary>
    public Guid? BatchId { get; set; }
    public Batch? Batch { get; set; }

    public string SerialNumber { get; set; } = string.Empty;

    public SerialStatus Status { get; set; } = SerialStatus.InStock;

    /// <summary>Set when Sold — the sale that consumed this unit, for tracing.</summary>
    public Guid? SaleId { get; set; }
    public Sale? Sale { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SoldAt { get; set; }

    /// <summary>Section 6 — stamped on every save, drives incremental sync pull.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
