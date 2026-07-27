namespace PharmaStock.Domain.Models;

/// <summary>Section 21.1 — one row per device/session a user has authenticated
/// from. This is what powers both the per-company device list (Web Admin) and
/// the cross-company aggregate view (Super Admin, Section 22.4).</summary>
public class Device
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Denormalized for fast per-company/cross-company counting without
    /// always joining through User — Section 21.1 and 22.4 both query by this.</summary>
    public Guid? CompanyId { get; set; }

    public DevicePlatform Platform { get; set; }
    public string DeviceName { get; set; } = string.Empty;
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set true by an admin from the Web device list (Section 21.1).
    /// The device's next API call is rejected and it must re-authenticate.</summary>
    public bool IsRevoked { get; set; } = false;

    /// <summary>Set true alongside IsRevoked when hardware is confirmed lost.
    /// The device checks this flag on its next successful contact and wipes
    /// its local database before anything else happens.</summary>
    public bool RemoteWipeRequested { get; set; } = false;

    /// <summary>SHA-256 hex hash of the current refresh token, never the raw
    /// value (same reasoning as User.PasswordHash: a stolen DB dump must not
    /// hand out live sessions). Null means this device has no active refresh
    /// token and must fully re-authenticate with phone+password.</summary>
    public string? RefreshTokenHash { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }
}
