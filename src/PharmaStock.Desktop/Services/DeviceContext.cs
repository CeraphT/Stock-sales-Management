namespace PharmaStock.Desktop.Services;

/// <summary>Maps this installation's MAUI DeviceInfo to the values the API's
/// device-aware auth endpoints expect (Section 21.1) — kept in one place so
/// LoginPage and CreateCompanyPage, the two screens that start a session,
/// don't each re-derive it. Fully qualified throughout: PharmaStock.Domain's
/// own DevicePlatform enum (Desktop/Mobile/Web) shares its name with MAUI's
/// own Microsoft.Maui.Devices.DevicePlatform (Android/iOS/WinUI/...), which
/// are two different concepts easy to accidentally conflate.</summary>
public static class DeviceContext
{
    public static PharmaStock.Domain.Models.DevicePlatform Platform =>
        Microsoft.Maui.Devices.DeviceInfo.Current.Platform == Microsoft.Maui.Devices.DevicePlatform.Android
            ? PharmaStock.Domain.Models.DevicePlatform.Mobile
            : PharmaStock.Domain.Models.DevicePlatform.Desktop;

    public static string Name => Microsoft.Maui.Devices.DeviceInfo.Current.Name;
}
