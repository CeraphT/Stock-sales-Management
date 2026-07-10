namespace PharmaStock.Desktop.Services;

/// <summary>Stores the current logged-in session (JWT + who/what company)
/// via MAUI's built-in Preferences store. This is a stopgap for local dev —
/// Section 6's real offline-first design calls for the session to live
/// alongside a device-bound refresh token in the local SQLite store, not
/// plain key-value Preferences, once that groundwork is built.</summary>
public class SessionService
{
    private const string TokenKey = "auth_token";
    private const string CompanyIdKey = "company_id";
    private const string UserNameKey = "user_name";
    private const string UserRoleKey = "user_role";

    public string? Token => Preferences.Default.Get(TokenKey, string.Empty) is { Length: > 0 } t ? t : null;
    public string? UserName => Preferences.Default.Get(UserNameKey, string.Empty) is { Length: > 0 } n ? n : null;
    public string? UserRole => Preferences.Default.Get(UserRoleKey, string.Empty) is { Length: > 0 } r ? r : null;

    public Guid? CompanyId
    {
        get
        {
            var raw = Preferences.Default.Get(CompanyIdKey, string.Empty);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public bool IsLoggedIn => Token is not null;

    public void Save(AuthResponse auth)
    {
        Preferences.Default.Set(TokenKey, auth.Token);
        Preferences.Default.Set(UserNameKey, auth.User.Name);
        Preferences.Default.Set(UserRoleKey, auth.User.Role.ToString());
        Preferences.Default.Set(CompanyIdKey, auth.CompanyId?.ToString() ?? string.Empty);
    }

    public void Clear()
    {
        Preferences.Default.Remove(TokenKey);
        Preferences.Default.Remove(CompanyIdKey);
        Preferences.Default.Remove(UserNameKey);
        Preferences.Default.Remove(UserRoleKey);
    }
}
