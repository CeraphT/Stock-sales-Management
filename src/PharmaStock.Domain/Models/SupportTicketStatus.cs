namespace PharmaStock.Domain.Models;

/// <summary>Lifecycle of a support request, driven by the SuperAdmin console.
/// Serialized as an integer — client enums must keep this order.</summary>
public enum SupportTicketStatus
{
    Open,
    InProgress,
    Resolved,
    Closed,
}
