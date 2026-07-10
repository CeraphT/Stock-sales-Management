namespace PharmaStock.Domain.Models;

/// <summary>Section 18.1 — split payment: a sale can be paid through more
/// than one method (e.g. part cash, part Mobile Money). When a sale has
/// exactly one payment method, PaymentSplits may be empty and Sale.PaymentMethod
/// alone is authoritative.</summary>
public class PaymentSplit
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public PaymentMethod Method { get; set; }
    public decimal Amount { get; set; }
}
