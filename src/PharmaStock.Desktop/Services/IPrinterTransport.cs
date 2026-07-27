namespace PharmaStock.Desktop.Services;

public enum PrinterConnectionType { Bluetooth, Usb }

public record PrinterDevice(string Id, string Name, PrinterConnectionType ConnectionType);

/// <summary>One physical transport for sending raw ESC/POS bytes to a
/// receipt printer. Android gets two real implementations (Bluetooth SPP,
/// USB Host) under Platforms/Android/Services — see ReceiptPrintingService,
/// which fans out to whichever transports are registered for the current
/// platform. Windows registers none, so printing there simply reports "no
/// printer found" rather than crashing (thermal receipt printers are an
/// Android-primary feature, per the project's POS priority).</summary>
public interface IPrinterTransport
{
    PrinterConnectionType ConnectionType { get; }
    Task<List<PrinterDevice>> DiscoverAsync(CancellationToken ct = default);
    Task SendAsync(PrinterDevice device, byte[] data, CancellationToken ct = default);

    /// <summary>Prepares the transport itself, prompting the OS if needed,
    /// before a scan is even useful — Bluetooth: requests the runtime
    /// permission and, if the adapter is off, launches the system "turn on
    /// Bluetooth" dialog. USB has nothing global to prepare, so it's a no-op
    /// returning true. Called automatically when PrinterSettingsPage opens
    /// or is refreshed, so the user never has to know these prompts exist —
    /// they just appear.</summary>
    Task<bool> EnsureTransportReadyAsync(CancellationToken ct = default);

    /// <summary>Prepares one specific device for use — USB: requests the
    /// per-device access grant if not already held (fires the moment the
    /// device is picked, rather than waiting until the first print attempt).
    /// Bluetooth devices are already "ready" the moment they're bonded, so
    /// this is a no-op returning true there.</summary>
    Task<bool> EnsureDeviceAuthorizedAsync(PrinterDevice device, CancellationToken ct = default);

    /// <summary>True if this transport has an OS-level settings screen worth
    /// linking to for pairing/connecting new hardware (Bluetooth: yes, its
    /// own pairing UI; USB: no, it's plug-and-play with no settings screen).</summary>
    bool HasPairingSettingsScreen { get; }
    Task OpenPairingSettingsAsync();
}
