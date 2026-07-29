using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Controls;

/// <summary>A compact FR/EN segmented pill mirroring
/// LocalizationService.IsEnglish — tap either segment to switch. Replaces
/// the old real on/off Switch (see git history), which rendered far larger
/// than intended on Windows since WinUI's native ToggleSwitch ignores
/// WidthRequest.</summary>
public partial class LanguageSwitch : ContentView
{
    public LanguageSwitch()
    {
        InitializeComponent();
        ApplySelection();
        LocalizationService.LanguageChanged += OnLanguageChanged;
    }

    private void OnFrTapped(object? sender, TappedEventArgs e) => LocalizationService.CurrentLanguage = "fr";
    private void OnEnTapped(object? sender, TappedEventArgs e) => LocalizationService.CurrentLanguage = "en";

    // Keeps this control's selected pill correct if the language was changed
    // from another still-alive instance of this same control on a different
    // page — same WeakEventManager reasoning as the old Switch version (see
    // LocalizationService.LanguageChanged's own doc comment).
    private void OnLanguageChanged(object? sender, EventArgs e) => ApplySelection();

    private void ApplySelection()
    {
        var isEnglish = LocalizationService.IsEnglish;
        SetPillState(FrPill, active: !isEnglish);
        SetPillState(EnPill, active: isEnglish);
    }

    private static void SetPillState(Border pill, bool active)
    {
        var label = (Label)pill.Content;
        if (active)
        {
            pill.SetAppThemeColor(Border.BackgroundColorProperty,
                (Color)Application.Current!.Resources["Primary"],
                (Color)Application.Current!.Resources["PrimaryDark"]);
            label.SetAppThemeColor(Label.TextColorProperty,
                (Color)Application.Current!.Resources["White"],
                (Color)Application.Current!.Resources["PrimaryDarkText"]);
        }
        else
        {
            pill.BackgroundColor = Colors.Transparent;
            label.SetAppThemeColor(Label.TextColorProperty,
                (Color)Application.Current!.Resources["TextSecondary"],
                (Color)Application.Current!.Resources["Gray300"]);
        }
    }
}
