namespace PharmaStock.Domain.Models;

/// <summary>Section 20.6 — optional link from a service to the stock items it
/// consumes when billed (e.g. "Kit accouchement" consuming specific supplies).
/// Empty by default: most services (consultations, sutures) have no rows here
/// and therefore have zero effect on stock when sold.</summary>
public class ServiceStockLink
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ServiceId { get; set; }
    public Service? Service { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public int QuantityConsumedInBaseUnits { get; set; }
}
