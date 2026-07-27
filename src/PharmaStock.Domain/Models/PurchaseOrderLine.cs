namespace PharmaStock.Domain.Models;

public class PurchaseOrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    /// <summary>Always in base units, same convention as SaleLine/StockMovement.</summary>
    public int QuantityOrderedInBaseUnits { get; set; }
    public int QuantityReceivedInBaseUnits { get; set; }

    /// <summary>Expected cost per base unit at order time — the actual cost
    /// booked onto the resulting Batch is captured separately at receiving
    /// time (a supplier's invoice price can differ from what was quoted).</summary>
    public decimal UnitCost { get; set; }
}
