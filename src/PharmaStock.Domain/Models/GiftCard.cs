namespace PharmaStock.Domain.Models;

/// <summary>Section 21.3 — a prepaid gift card, tracked independently of any
/// single customer so it can be gifted/transferred and redeemed by whoever holds the code.</summary>
public class GiftCard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Code { get; set; } = string.Empty;
    public decimal InitialValue { get; set; }
    public decimal RemainingValue { get; set; }
    public bool Active { get; set; } = true;
}
