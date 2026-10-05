namespace PharmaStock.Domain.Models;

/// <summary>One message in a support request's conversation: the reporter's
/// follow-ups and the support team's replies. <see cref="IsInternal"/> notes are
/// support-only — never returned to the reporter.</summary>
public class SupportMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TicketId { get; set; }
    public SupportTicket? Ticket { get; set; }

    public Guid AuthorUserId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    /// <summary>True when written by a SuperAdmin (support), false for the reporter.</summary>
    public bool FromSupport { get; set; }
    /// <summary>Support-only internal note (triage, investigation) — hidden from the reporter.</summary>
    public bool IsInternal { get; set; }

    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
