namespace PharmaStock.Domain.Models;

public class Supplier : ITimestamped
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? ContactPhone { get; set; }
    public string? ContactEmail { get; set; }

    /// <summary>Section 6 — stamped automatically on every save, drives
    /// incremental sync pull to offline devices.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
