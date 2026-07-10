namespace PharmaStock.Domain.Models;

/// <summary>A single transaction (Section 3.1). Can hold product lines,
/// service lines (Section 20), or both on the same receipt.</summary>
public class Sale
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public decimal Total { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public SaleStatus Status { get; set; } = SaleStatus.Completed;

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public ICollection<SaleLine> ProductLines { get; set; } = new List<SaleLine>();
    public ICollection<ServiceLine> ServiceLines { get; set; } = new List<ServiceLine>();
    public ICollection<PaymentSplit> PaymentSplits { get; set; } = new List<PaymentSplit>();
    public InstallmentPlan? InstallmentPlan { get; set; }
}
