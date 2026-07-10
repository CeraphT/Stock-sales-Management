namespace PharmaStock.Domain.Models;

/// <summary>Section 21.3 — loyalty points and store-credit balance for a
/// customer. Deliberately separate from Customer.CreditBalance (which is
/// simple purchase-on-credit debt) since loyalty points follow different
/// earn/redeem rules than a debt balance.</summary>
public class LoyaltyAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public int PointsBalance { get; set; } = 0;
    public decimal StoreCreditBalance { get; set; } = 0;
}
