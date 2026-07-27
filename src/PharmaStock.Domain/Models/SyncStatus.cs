namespace PharmaStock.Domain.Models;

/// <summary>Section 6 — whether a Sale/CashRegisterShift created on an
/// offline device has been pushed to the server yet. Rows created directly
/// through the server's own online-only endpoints are born Synced (a no-op
/// everywhere except the Desktop local-first write path).</summary>
public enum SyncStatus
{
    Synced,
    PendingPush
}
