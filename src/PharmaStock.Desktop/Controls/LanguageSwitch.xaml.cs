using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Controls;

/// <summary>A real on/off Switch mirroring LocalizationService.IsEnglish
/// (On = English, Off = French), flanked by static FR/EN labels — replaces
/// the old tap-to-swap "EN"/"FR" text button on Onboarding/Login/Dashboard.
/// Subscribes to LanguageChanged for its own lifetime without ever manually
/// unsubscribing: LocalizationService uses a WeakEventManager specifically
/// so per-instance subscribers like this one don't need to (see its own
/// doc comment) — safe even though pages hosting this control can stay
/// alive indefinitely under Shell's FlyoutItem-wrapping.</summary>
public partial class LanguageSwitch : ContentView
{
    public LanguageSwitch()
    {
        InitializeComponent();
        SwitchControl.IsToggled = LocalizationService.IsEnglish;
        LocalizationService.LanguageChanged += OnLanguageChanged;
    }

    private void OnToggled(object? sender, ToggledEventArgs e) =>
        LocalizationService.CurrentLanguage = e.Value ? "en" : "fr";

    // Keeps the thumb position correct if the language was changed from
    // another still-alive instance of this same control on a different page.
    private void OnLanguageChanged(object? sender, EventArgs e)
    {
        if (SwitchControl.IsToggled != LocalizationService.IsEnglish)
            SwitchControl.IsToggled = LocalizationService.IsEnglish;
    }
}
