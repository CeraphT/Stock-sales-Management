namespace PharmaStock.Desktop.Controls;

/// <summary>A transient bottom toast replacing both the inline "ErrorText"
/// labels and the boilerplate DisplayAlert("Erreur", ex.Message, "OK")
/// pattern that used to be duplicated across nearly every page. Attached to
/// a page via Services/ToastExtensions.cs rather than declared in XAML, so
/// no page markup needs to change.</summary>
public partial class Toast : ContentView
{
    private const uint FadeDurationMs = 150;
    private const int VisibleDurationMs = 3500;

    private CancellationTokenSource? _cts;

    public Toast() => InitializeComponent();

    public void Show(string message, bool isError = true)
    {
        _cts?.Cancel();
        var cts = new CancellationTokenSource();
        _cts = cts;

        MessageLabel.Text = message;
        Bubble.BackgroundColor = (Color)Application.Current!.Resources[isError ? "ErrorColor" : "SuccessColor"];

        MainThread.BeginInvokeOnMainThread(async () => await AnimateAsync(cts));
    }

    private async Task AnimateAsync(CancellationTokenSource cts)
    {
        Bubble.IsVisible = true;
        Bubble.Opacity = 0;
        Bubble.TranslationY = 24;

        await Task.WhenAll(
            Bubble.FadeTo(1, FadeDurationMs),
            Bubble.TranslateTo(0, 0, FadeDurationMs));

        try
        {
            await Task.Delay(VisibleDurationMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
            // Superseded by a newer message — that call's own animation owns hiding it.
            return;
        }

        await Task.WhenAll(
            Bubble.FadeTo(0, FadeDurationMs),
            Bubble.TranslateTo(0, 24, FadeDurationMs));
        Bubble.IsVisible = false;
    }
}
