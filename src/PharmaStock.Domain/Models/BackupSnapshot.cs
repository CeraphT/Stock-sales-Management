namespace PharmaStock.Domain.Models;

/// <summary>One day's recorded status of one backup source (a Postgres dump, the
/// HouseBudget per-property exports, the off-server copy). Written by the daily
/// backup report; feeds its 28-day history bar and the "since yesterday" KPI
/// deltas. Server dumps are only retained 14 days, so this table is the only
/// place the longer history survives. One row per (Day, SourceKey).</summary>
public class BackupSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The UTC day this row describes (midnight UTC).</summary>
    public DateTime Day { get; set; }

    /// <summary>Stable source identifier, e.g. "pg:pharmastock", "pg:housebudget",
    /// "hb-exports", "offsite".</summary>
    public string SourceKey { get; set; } = string.Empty;

    public BackupState State { get; set; }

    /// <summary>Size of that day's newest backup (bytes), 0 when none.</summary>
    public long SizeBytes { get; set; }

    /// <summary>Per-feature row counts at that time, as a JSON object
    /// ({"Ventes": 1204, ...}); null for sources without KPIs.</summary>
    public string? KpiJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
