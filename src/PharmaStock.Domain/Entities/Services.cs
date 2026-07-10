namespace PharmaStock.Domain.Entities;

/// <summary>Section 20 — a fixed-price service (e.g. "Consultation prénatale").
/// Entirely independent of Product/Batch/StockMovement: a company with
/// Company.ServicesModuleEnabled == false simply has zero rows in this table,
/// and no code path anywhere else in the system references it.</summary>
public class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public decimal FixedPrice { get; set; }
    public string? Category { get; set; }

    /// <summary>Deactivating (rather than deleting) preserves historical sales
    /// records if a service is discontinued (Section 20.4).</summary>
    public bool Active { get; set; } = true;

    public ICollection<ServiceStockLink> StockLinks { get; set; } = new List<ServiceStockLink>();
}

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

/// <summary>A billed service line on a sale (Section 20.2). Attaches to the
/// same Sale record as SaleLine so one receipt can mix products and services.</summary>
public class ServiceLine
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public Guid ServiceId { get; set; }
    public Service? Service { get; set; }

    public decimal BilledPrice { get; set; }
    public int Quantity { get; set; } = 1;
}
