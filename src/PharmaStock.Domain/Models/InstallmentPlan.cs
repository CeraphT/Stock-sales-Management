namespace PharmaStock.Domain.Models;

/// <summary>Section 21.4 — a sale split into scheduled partial payments,
/// either Layaway (goods held until fully paid) or InstallmentCredit
/// (goods released immediately, balance collected over time).</summary>
public class InstallmentPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public decimal TotalAmount { get; set; }
    public int NumberOfInstallments { get; set; }
    public InstallmentMode Mode { get; set; }

    public ICollection<InstallmentPayment> Payments { get; set; } = new List<InstallmentPayment>();

    public decimal RemainingBalance => TotalAmount - Payments.Sum(p => p.AmountPaid);
    public bool IsFullyPaid => RemainingBalance <= 0;
}
