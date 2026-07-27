using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class PrinterSettingsPage : ContentPage
{
    private readonly ReceiptPrintingService _printing;
    private bool _loading;

    public PrinterSettingsPage(ReceiptPrintingService printing, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _printing = printing;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        UpdateSelectedLabel();
        PairBluetoothButton.IsVisible = _printing.Transports.Any(t => t.HasPairingSettingsScreen);
        try
        {
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnRefreshClicked(object? sender, EventArgs e)
    {
        try
        {
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    // DiscoverAllAsync also readies every transport first (requests Bluetooth
    // permission, prompts to turn Bluetooth on if it's off) — so opening or
    // refreshing this page is enough to trigger those OS prompts on its own.
    private async Task RefreshAsync()
    {
        if (_loading) return;
        _loading = true;
        // The slowest fetch in the app — DiscoverAllAsync can involve OS
        // Bluetooth permission prompts and scan latency — so it's the one
        // most in need of visible feedback, not less.
        DevicesView.ItemsSource = null;
        EmptyLabel.IsVisible = false;
        RefreshButton.IsEnabled = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var devices = await _printing.DiscoverAllAsync();
            DevicesView.ItemsSource = devices.Select(d => new DeviceRow(d)).ToList();
            EmptyLabel.IsVisible = devices.Count == 0;
        }
        finally
        {
            _loading = false;
            RefreshButton.IsEnabled = true;
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private void UpdateSelectedLabel()
    {
        var selected = _printing.SelectedPrinter;
        SelectedPrinterLabel.Text = selected is null
            ? LocalizationService.Translate("Printer_NoneSelected")
            : LocalizationService.Translate("Printer_CurrentPrinter", selected.Name, ConnectionTypeText(selected.ConnectionType));
        TestPrintButton.IsEnabled = selected is not null;
    }

    private async void OnDeviceSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as DeviceRow;
        DevicesView.SelectedItem = null;
        if (row is null) return;

        _printing.SelectPrinter(row.Device);
        UpdateSelectedLabel();

        // Fires the USB permission prompt immediately for USB devices (no-op
        // for Bluetooth, already-bonded devices need nothing more) — the
        // device is still saved as the default either way, so a "not now"
        // tap on the OS prompt doesn't lose the selection; it just needs
        // granting again the first time something is actually printed.
        var authorized = await _printing.EnsureDeviceAuthorizedAsync(row.Device);
        await this.DisplayAlertAsync(
            LocalizationService.Translate("Shell_PrinterSettings"),
            LocalizationService.Translate(authorized ? "Printer_SetAsDefault" : "Printer_SetAsDefaultUnauthorized", row.Device.Name),
            LocalizationService.Translate("Common_OK"));
    }

    private async void OnPairBluetoothClicked(object? sender, EventArgs e)
    {
        var transport = _printing.Transports.FirstOrDefault(t => t.HasPairingSettingsScreen);
        if (transport is null) return;

        await transport.OpenPairingSettingsAsync();
    }

    private async void OnTestPrintClicked(object? sender, EventArgs e)
    {
        var selected = _printing.SelectedPrinter;
        if (selected is null) return;

        TestPrintButton.IsEnabled = false;
        try
        {
            await _printing.PrintTestPageAsync(selected);
            await this.DisplayAlertAsync(LocalizationService.Translate("Printer_PrintingTitle"), LocalizationService.Translate("Printer_TestPageSent"), LocalizationService.Translate("Common_OK"));
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            TestPrintButton.IsEnabled = _printing.SelectedPrinter is not null;
        }
    }

    private static string ConnectionTypeText(PrinterConnectionType type) =>
        type == PrinterConnectionType.Bluetooth ? "Bluetooth" : "USB";

    private sealed class DeviceRow
    {
        public PrinterDevice Device { get; }
        public string Name => Device.Name;
        public string SubtitleText => ConnectionTypeText(Device.ConnectionType);

        public DeviceRow(PrinterDevice device) => Device = device;
    }
}
