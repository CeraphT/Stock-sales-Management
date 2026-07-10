namespace PharmaStock.Domain.Models;

public class InstallmentPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid InstallmentPlanId { get; set; }
    public InstallmentPlan? InstallmentPlan { get; set; }

    public decimal AmountPaid { get; set; }
    public DateTime DatePaid { get; set; } = DateTime.UtcNow;
}
