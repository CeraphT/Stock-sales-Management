namespace PharmaStock.Desktop.Services;

/// <summary>Stores the current logged-in session (JWT + refresh token +
/// who/what company) via MAUI's built-in Preferences store. This is a
/// stopgap for local dev — Section 6's real offline-first design calls for
/// the session to live in the local SQLite store, not plain key-value
/// Preferences, once that groundwork is built.</summary>
public class SessionService
{
    private const string TokenKey = "auth_token";
    private const string TokenExpiresAtKey = "auth_token_expires_at";
    private const string RefreshTokenKey = "refresh_token";
    private const string DeviceIdKey = "device_id";
    private const string CompanyIdKey = "company_id";
    private const string UserNameKey = "user_name";
    private const string UserRoleKey = "user_role";
    private const string UserIdKey = "user_id";
    private const string LocationIdKey = "location_id";
    private const string LastSyncedAtKey = "last_synced_at";

    public string? Token => Preferences.Default.Get(TokenKey, string.Empty) is { Length: > 0 } t ? t : null;
    public string? RefreshToken => Preferences.Default.Get(RefreshTokenKey, string.Empty) is { Length: > 0 } t ? t : null;
    public string? UserName => Preferences.Default.Get(UserNameKey, string.Empty) is { Length: > 0 } n ? n : null;
    public string? UserRole => Preferences.Default.Get(UserRoleKey, string.Empty) is { Length: > 0 } r ? r : null;

    public DateTime? TokenExpiresAt
    {
        get
        {
            var raw = Preferences.Default.Get(TokenExpiresAtKey, string.Empty);
            return DateTime.TryParse(raw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt) ? dt : null;
        }
    }

    /// <summary>Generated once on first run and persisted forever after —
    /// this Guid is this installation's identity for Device/refresh-token
    /// bookkeeping (Section 21.1), independent of which user is currently
    /// logged in on it.</summary>
    public Guid DeviceId
    {
        get
        {
            var raw = Preferences.Default.Get(DeviceIdKey, string.Empty);
            if (Guid.TryParse(raw, out var id)) return id;

            var generated = Guid.NewGuid();
            Preferences.Default.Set(DeviceIdKey, generated.ToString());
            return generated;
        }
    }

    public Guid? CompanyId
    {
        get
        {
            var raw = Preferences.Default.Get(CompanyIdKey, string.Empty);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public Guid? UserId
    {
        get
        {
            var raw = Preferences.Default.Get(UserIdKey, string.Empty);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    // Set lazily by PosPage once it resolves the company's (currently
    // single, default "Main") location — no location-picker UI exists yet.
    public Guid? LocationId
    {
        get
        {
            var raw = Preferences.Default.Get(LocationIdKey, string.Empty);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    // Watermark for incremental sync pull (Section 6) — null means "never
    // synced," which the pull endpoint treats as a request for a full,
    // not incremental, snapshot. Lives in Preferences (not the local SQLite
    // store) so it's readable before any local-DB migration has run.
    public DateTime? LastSyncedAt
    {
        get
        {
            var raw = Preferences.Default.Get(LastSyncedAtKey, string.Empty);
            return DateTime.TryParse(raw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt) ? dt : null;
        }
    }

    public void SaveLastSyncedAt(DateTime timestamp) => Preferences.Default.Set(LastSyncedAtKey, timestamp.ToString("o"));

    public bool IsLoggedIn => Token is not null;

    /// <summary>Fired after Save()/Clear() — AppShell's flyout header
    /// subscribes to this so the displayed name/role stays correct across a
    /// login/logout within the same running process. Without it, the header
    /// (built once at app startup, before any session existed) keeps
    /// showing whatever was true then — including a previous user's name
    /// after a different account logs in on the same device.</summary>
    public event EventHandler? Changed;

    public void Save(AuthResponse auth)
    {
        Preferences.Default.Set(TokenKey, auth.Token);
        Preferences.Default.Set(TokenExpiresAtKey, auth.ExpiresAt.ToString("o"));
        Preferences.Default.Set(RefreshTokenKey, auth.RefreshToken);
        // DeviceId is deliberately NOT overwritten from auth.DeviceId here even
        // though the server echoes it back — this installation's DeviceId is
        // its own fixed identity (see the DeviceId getter), and the server is
        // always given that same value on every login/refresh call, so the two
        // are already guaranteed to match.
        Preferences.Default.Set(UserNameKey, auth.User.Name);
        Preferences.Default.Set(UserRoleKey, auth.User.Role.ToString());
        Preferences.Default.Set(UserIdKey, auth.User.Id.ToString());
        Preferences.Default.Set(CompanyIdKey, auth.CompanyId?.ToString() ?? string.Empty);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void SaveLocationId(Guid locationId) => Preferences.Default.Set(LocationIdKey, locationId.ToString());

    // DeviceId is intentionally left in place on logout — it identifies this
    // physical installation, not the signed-in user, so the next login on
    // this same device keeps reusing (rather than orphaning) its Device row.
    public void Clear()
    {
        Preferences.Default.Remove(TokenKey);
        Preferences.Default.Remove(TokenExpiresAtKey);
        Preferences.Default.Remove(RefreshTokenKey);
        Preferences.Default.Remove(CompanyIdKey);
        Preferences.Default.Remove(UserNameKey);
        Preferences.Default.Remove(UserRoleKey);
        Preferences.Default.Remove(UserIdKey);
        Preferences.Default.Remove(LocationIdKey);
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
