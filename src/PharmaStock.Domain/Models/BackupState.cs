namespace PharmaStock.Domain.Models;

/// <summary>Outcome of one backup source on one day, as shown in the daily
/// backup report and the super-admin Backups page.</summary>
public enum BackupState
{
    NoBackup,
    Completed,
    CompletedWithErrors,
    InProcess,
    Unsuccessful,
}
