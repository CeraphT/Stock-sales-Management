namespace PharmaStock.Desktop.Services;

public class NoPrinterConfiguredException : Exception
{
    public NoPrinterConfiguredException()
        : base("Aucune imprimante n'est configurée. Choisissez-en une dans le menu Imprimante.") { }
}

/// <summary>Combines whatever IPrinterTransport implementations are
/// registered for the current platform (Bluetooth + USB on Android, none on
/// Windows — see IPrinterTransport) and remembers which single device is the
/// default receipt printer, the same way SessionService remembers the JWT:
/// plain MAUI Preferences, no server round-trip needed for a per-device
/// setting like this.</summary>
public class ReceiptPrintingService
{
    private const string PrinterIdKey = "printer_device_id";
    private const string PrinterNameKey = "printer_device_name";
    private const string PrinterTypeKey = "printer_connection_type";

    private readonly IEnumerable<IPrinterTransport> _transports;

    public ReceiptPrintingService(IEnumerable<IPrinterTransport> transports)
    {
        _transports = transports;
    }

    public PrinterDevice? SelectedPrinter
    {
        get
        {
            var id = Preferences.Default.Get(PrinterIdKey, string.Empty);
            if (string.IsNullOrEmpty(id)) return null;

            var name = Preferences.Default.Get(PrinterNameKey, string.Empty);
            var typeRaw = Preferences.Default.Get(PrinterTypeKey, string.Empty);
            if (!Enum.TryParse<PrinterConnectionType>(typeRaw, out var type)) return null;

            return new PrinterDevice(id, name, type);
        }
    }

    public void SelectPrinter(PrinterDevice device)
    {
        Preferences.Default.Set(PrinterIdKey, device.Id);
        Preferences.Default.Set(PrinterNameKey, device.Name);
        Preferences.Default.Set(PrinterTypeKey, device.ConnectionType.ToString());
    }

    public void ClearSelection()
    {
        Preferences.Default.Remove(PrinterIdKey);
        Preferences.Default.Remove(PrinterNameKey);
        Preferences.Default.Remove(PrinterTypeKey);
    }

    /// <summary>Readies every registered transport (requests permissions,
    /// prompts to turn Bluetooth on if it's off) before listing devices, so
    /// the OS-level prompts a user needs appear automatically just from
    /// opening or refreshing the Imprimante page — nothing to hunt for in
    /// Android's own settings first.</summary>
    public async Task<List<PrinterDevice>> DiscoverAllAsync(CancellationToken ct = default)
    {
        var results = new List<PrinterDevice>();
        foreach (var transport in _transports)
        {
            await transport.EnsureTransportReadyAsync(ct);
            results.AddRange(await transport.DiscoverAsync(ct));
        }
        return results;
    }

    /// <summary>Called the moment a device is picked in the list — for USB
    /// this fires the permission prompt right away instead of waiting for
    /// the first print attempt; for Bluetooth it's a no-op (bonded devices
    /// are already authorized).</summary>
    public Task<bool> EnsureDeviceAuthorizedAsync(PrinterDevice device, CancellationToken ct = default)
    {
        var transport = _transports.FirstOrDefault(t => t.ConnectionType == device.ConnectionType);
        return transport?.EnsureDeviceAuthorizedAsync(device, ct) ?? Task.FromResult(false);
    }

    public IReadOnlyList<IPrinterTransport> Transports => _transports as IReadOnlyList<IPrinterTransport> ?? _transports.ToList();

    public async Task PrintReceiptAsync(ReceiptData receipt, CancellationToken ct = default)
    {
        var device = SelectedPrinter ?? throw new NoPrinterConfiguredException();
        var transport = _transports.FirstOrDefault(t => t.ConnectionType == device.ConnectionType)
            ?? throw new NoPrinterConfiguredException();

        var bytes = ReceiptFormatter.Build(receipt);
        await transport.SendAsync(device, bytes, ct);
    }

    public Task PrintTestPageAsync(PrinterDevice device, CancellationToken ct = default)
    {
        var transport = _transports.FirstOrDefault(t => t.ConnectionType == device.ConnectionType)
            ?? throw new NoPrinterConfiguredException();

        var testReceipt = new ReceiptData(
            "PharmaStock", LocalizationService.Translate("Printer_TestPageLabel"), "—", DateTime.Now,
            new List<ReceiptLine> { new(LocalizationService.Translate("Printer_TestPageItem"), LocalizationService.Translate("Pos_ReceiptUnitLine", 1, "100"), "100") },
            "100", LocalizationService.Translate("Printer_TestPageLabel"), "XAF");

        return transport.SendAsync(device, ReceiptFormatter.Build(testReceipt), ct);
    }
}
