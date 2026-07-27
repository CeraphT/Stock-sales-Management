namespace PharmaStock.Domain.Models;

public class Customer : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }

    /// <summary>Section 3.5 — running credit/debt balance for regular customers.
    /// Positive means the customer owes the business; negative means the
    /// business owes the customer (e.g. an unrefunded return, Section 21.3).</summary>
    public decimal CreditBalance { get; set; } = 0;

    /// <summary>Section 21.3 — one-to-one, kept as a separate entity so a
    /// company that never enables loyalty/credit has simply no rows here.</summary>
    public LoyaltyAccount? LoyaltyAccount { get; set; }

    /// <summary>Section 6 — stamped automatically on every save, drives
    /// incremental sync pull to offline devices.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
