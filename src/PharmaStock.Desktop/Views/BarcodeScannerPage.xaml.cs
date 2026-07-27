using PharmaStock.Desktop.Services;
using ZXing.Net.Maui;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal camera scanner, pushed by instance via
/// Navigation.PushModalAsync (not a Shell route — see AppShell.xaml.cs).
/// Kept as a modal rather than embedded in PosPage so the camera isn't
/// running continuously while the cashier works the cart.</summary>
public partial class BarcodeScannerPage : ContentPage
{
    private TaskCompletionSource<string?>? _completionSource;
    private bool _resultDelivered;

    public BarcodeScannerPage()
    {
        InitializeComponent();

        // BarcodeReaderOptions.Formats has no default — an unset Options
        // (the previous state here) decodes for zero formats, so the camera
        // runs but can never match anything, no matter what's in frame.
        BarcodeReader.Options = new BarcodeReaderOptions
        {
            Formats = BarcodeFormats.All,
            AutoRotate = true,
            TryHarder = true,
        };
    }

    /// <summary>Call after pushing this page modally; resolves with the
    /// decoded barcode, or null if the user cancelled.</summary>
    public Task<string?> ScanAsync()
    {
        _resultDelivered = false;
        _completionSource = new TaskCompletionSource<string?>();
        return _completionSource.Task;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            var status = await Permissions.RequestAsync<Permissions.Camera>();
            if (status != PermissionStatus.Granted)
            {
                await this.DisplayAlertAsync(LocalizationService.Translate("Scanner_PermissionTitle"), LocalizationService.Translate("Scanner_PermissionMessage"), LocalizationService.Translate("Common_OK"));
                await CloseAsync(null);
            }
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnBarcodesDetected(object? sender, BarcodeDetectionEventArgs e)
    {
        if (_resultDelivered) return;
        var value = e.Results.FirstOrDefault()?.Value;
        if (string.IsNullOrWhiteSpace(value)) return;

        _resultDelivered = true;
        await MainThread.InvokeOnMainThreadAsync(() => CloseAsync(value));
    }

    private async void OnCancelClicked(object? sender, EventArgs e)
    {
        try
        {
            await CloseAsync(null);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task CloseAsync(string? barcode)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(barcode);
        }
    }
}
