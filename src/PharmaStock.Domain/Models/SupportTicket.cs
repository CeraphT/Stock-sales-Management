namespace PharmaStock.Domain.Models;

/// <summary>A bug report / "I'm blocked" / question filed from any client
/// (mobile, desktop, web) through the in-app Support screen, triaged by the
/// SuperAdmin in the web console. Carries the context needed to reproduce
/// (platform, app version, device, the screen the user was on) and optional
/// image attachments (screenshots, photos).</summary>
public class SupportTicket
{
    /// <summary>Client-generated when filed offline (outbox) so a replayed
    /// submission is acknowledged instead of duplicated.</summary>
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The reporter's business (null for a SuperAdmin outside any
    /// company). Denormalized name keeps the console readable.</summary>
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }

    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? UserPhone { get; set; }

    public SupportTicketCategory Category { get; set; } = SupportTicketCategory.Bug;
    public SupportTicketStatus Status { get; set; } = SupportTicketStatus.Open;

    /// <summary>Short summary (first line of the description if not given).</summary>
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    // ── Context captured automatically by the client ────────────────────
    public DevicePlatform Platform { get; set; }
    public string? AppVersion { get; set; }
    public string? DeviceInfo { get; set; }
    /// <summary>The screen/route the user was on when they opened Support.</summary>
    public string? Screen { get; set; }

    /// <summary>The SuperAdmin's answer, shown to the reporter in "My requests".</summary>
    public string? AdminReply { get; set; }
    public DateTime? RepliedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }

    public ICollection<SupportAttachment> Attachments { get; set; } = new List<SupportAttachment>();
}
