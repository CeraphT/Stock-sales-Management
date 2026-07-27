namespace PharmaStock.Domain.Models;

/// <summary>A product category, scoped to one company. Replaces the earlier
/// free-text Product.Category string so categories can be listed, searched,
/// and reused consistently across the catalog.</summary>
public class Category : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Section 6 — stamped automatically on every save, drives
    /// incremental sync pull to offline devices.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
