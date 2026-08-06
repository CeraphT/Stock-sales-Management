namespace PharmaStock.Domain.Models;

/// <summary>An append-only record of sensitive administrative actions — mostly
/// SuperAdmin operations (impersonating a tenant, blocking/unblocking a device
/// or user, remote-wiping a device) plus notable auth events. Powers the
/// console's audit trail (Section 22). Never updated or deleted.</summary>
public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Who performed the action (a SuperAdmin, or the user for a login
    /// event). Denormalized name so the trail stays readable even if the actor
    /// is later removed.</summary>
    public Guid? ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;

    /// <summary>Machine-readable action key, e.g. "impersonate.start",
    /// "device.block", "device.unblock", "device.wipe", "user.block",
    /// "user.unblock", "auth.login".</summary>
    public string Action { get; set; } = string.Empty;

    /// <summary>What the action targeted: "company" | "device" | "user" (null
    /// for actor-only events).</summary>
    public string? TargetType { get; set; }
    public Guid? TargetId { get; set; }

    /// <summary>The tenant the action relates to, when applicable.</summary>
    public Guid? CompanyId { get; set; }

    /// <summary>Remote IP the action was performed from.</summary>
    public string? Ip { get; set; }

    /// <summary>Free-text human-readable summary (e.g. the company/device name).</summary>
    public string? Detail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
