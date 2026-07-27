namespace PharmaStock.Desktop.Services;

/// <summary>Manual light/dark override, layered on top of MAUI's built-in
/// AppThemeBinding system (already used throughout Styles.xaml and the
/// custom Card/FieldBorder/etc. styles) — setting Application.Current.
/// UserAppTheme re-evaluates every AppThemeBinding in the app automatically,
/// so no per-page work is needed beyond this. Persisted via Preferences,
/// the same mechanism SessionService already uses for the JWT.</summary>
public class ThemeService
{
    private const string ThemeKey = "app_theme";

    /// <summary>Call once at startup. If the user never toggled the theme,
    /// leaves UserAppTheme as Unspecified so the app keeps following the OS
    /// theme exactly as before this feature existed.</summary>
    public void ApplyPersisted()
    {
        var saved = Preferences.Default.Get(ThemeKey, string.Empty);
        if (Application.Current is null) return;

        Application.Current.UserAppTheme = saved switch
        {
            "Light" => AppTheme.Light,
            "Dark" => AppTheme.Dark,
            _ => AppTheme.Unspecified
        };
    }

    /// <summary>Flips relative to the effective current theme (RequestedTheme
    /// accounts for the OS theme when UserAppTheme is still Unspecified), so
    /// the very first tap always moves to the opposite of whatever's
    /// currently on screen rather than requiring two taps.</summary>
    public void Toggle()
    {
        if (Application.Current is null) return;

        var next = Application.Current.RequestedTheme == AppTheme.Dark ? AppTheme.Light : AppTheme.Dark;
        Application.Current.UserAppTheme = next;
        Preferences.Default.Set(ThemeKey, next.ToString());
    }

    public bool IsDark => Application.Current?.RequestedTheme == AppTheme.Dark;
}
