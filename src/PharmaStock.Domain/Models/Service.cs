namespace PharmaStock.Domain.Models;

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
