namespace PharmaStock.Domain.Models;

/// <summary>A stock order placed with a supplier, received line-by-line as
/// deliveries arrive — each receipt creates a real Batch (own batch number
/// and expiry), same as a manual stock receive, so a PO is never itself a
/// source of truth for stock, just the paper trail that led to it.</summary>
public class PurchaseOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    /// <summary>Section 16.6 — which branch this stock is being ordered for;
    /// every line's eventual Batch is created at this location.</summary>
    public Guid LocationId { get; set; }
    public Location? Location { get; set; }

    public Guid SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    public Guid CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }

    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Pending;
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PurchaseOrderLine> Lines { get; set; } = new List<PurchaseOrderLine>();
}
