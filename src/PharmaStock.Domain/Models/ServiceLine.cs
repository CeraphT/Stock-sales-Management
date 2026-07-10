namespace PharmaStock.Domain.Models;

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
