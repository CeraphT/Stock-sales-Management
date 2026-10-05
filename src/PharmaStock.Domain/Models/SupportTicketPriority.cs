namespace PharmaStock.Domain.Models;

/// <summary>Triage priority of a support request; drives the console's sort
/// order and response-time target (SLA): Urgent 4 h, High 24 h, Normal 72 h,
/// Low 7 days. Defaulted from the category on creation ("I'm blocked" → High).
/// Serialized as an integer — client enums must keep this order.</summary>
public enum SupportTicketPriority
{
    Low,
    Normal,
    High,
    Urgent,
}
