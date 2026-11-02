namespace PharmaStock.Domain.Models;

/// <summary>A single platform-wide key/value setting, not scoped to any company
/// (CompanyId-free on purpose). Used for cross-tenant operational configuration
/// managed from the super-admin console — e.g. the recipient address of the
/// daily backup-status e-mail (<c>Key = "backup.report.recipient"</c>). Keys are
/// unique; the value is free text interpreted by whoever reads the key.</summary>
public class PlatformSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
