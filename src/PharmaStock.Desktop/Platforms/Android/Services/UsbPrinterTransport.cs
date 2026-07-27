using Android.App;
using Android.Content;
using Android.Hardware.Usb;
using PharmaStock.Desktop.Services;
using Application = Android.App.Application;

namespace PharmaStock.Desktop.Platforms.Android.Services;

/// <summary>Sends raw ESC/POS bytes to a receipt printer wired in over
/// USB-C/OTG, using Android's USB Host API directly (there is no OS-level
/// driver for a generic thermal printer — this app talks to it as a raw
/// bulk-transfer USB device, the same way every ESC/POS USB printing library
/// does). Per-device access is a one-time runtime prompt (UsbManager grants
/// it persistently afterwards), not a manifest permission.</summary>
public class UsbPrinterTransport : IPrinterTransport
{
    private const string UsbPermissionAction = "com.pharmastock.app.USB_PERMISSION";

    public PrinterConnectionType ConnectionType => PrinterConnectionType.Usb;
    public bool HasPairingSettingsScreen => false; // USB is plug-and-play — no OS "pair a device" screen to link to

    public Task<List<PrinterDevice>> DiscoverAsync(CancellationToken ct = default)
    {
        var manager = GetUsbManager();
        var devices = manager?.DeviceList?.Values
            .Select(d => new PrinterDevice(
                d.DeviceName ?? d.DeviceId.ToString(),
                string.IsNullOrWhiteSpace(d.ProductName) ? $"Périphérique USB ({d.DeviceName})" : d.ProductName!,
                PrinterConnectionType.Usb))
            .ToList() ?? new List<PrinterDevice>();

        return Task.FromResult(devices);
    }

    // Nothing global to prepare for USB (no adapter to switch on, no
    // app-wide permission) — readiness is entirely per-device, handled by
    // EnsureDeviceAuthorizedAsync instead.
    public Task<bool> EnsureTransportReadyAsync(CancellationToken ct = default) => Task.FromResult(true);

    public async Task<bool> EnsureDeviceAuthorizedAsync(PrinterDevice device, CancellationToken ct = default)
    {
        var manager = GetUsbManager();
        var usbDevice = manager?.DeviceList?.Values.FirstOrDefault(d => d.DeviceName == device.Id);
        if (manager is null || usbDevice is null) return false;
        if (manager.HasPermission(usbDevice)) return true;

        await RequestPermissionAsync(Application.Context, manager, usbDevice);
        return manager.HasPermission(usbDevice);
    }

    public Task OpenPairingSettingsAsync() => Task.CompletedTask; // never called — HasPairingSettingsScreen is false

    public async Task SendAsync(PrinterDevice device, byte[] data, CancellationToken ct = default)
    {
        var manager = GetUsbManager()
            ?? throw new InvalidOperationException("USB non disponible sur cet appareil.");

        var usbDevice = manager.DeviceList?.Values.FirstOrDefault(d => d.DeviceName == device.Id)
            ?? throw new InvalidOperationException("Imprimante USB introuvable — vérifiez qu'elle est bien branchée.");

        if (!await EnsureDeviceAuthorizedAsync(device, ct))
            throw new InvalidOperationException("Permission USB refusée pour l'imprimante.");

        UsbInterface? printerInterface = null;
        UsbEndpoint? outEndpoint = null;
        for (var i = 0; i < usbDevice.InterfaceCount && outEndpoint is null; i++)
        {
            var iface = usbDevice.GetInterface(i)!;
            for (var e = 0; e < iface.EndpointCount; e++)
            {
                var endpoint = iface.GetEndpoint(e)!;
                if (endpoint.Direction == UsbAddressing.Out)
                {
                    printerInterface = iface;
                    outEndpoint = endpoint;
                    break;
                }
            }
        }

        if (printerInterface is null || outEndpoint is null)
            throw new InvalidOperationException("Aucun point de sortie USB compatible n'a été trouvé sur cette imprimante.");

        using var connection = manager.OpenDevice(usbDevice)
            ?? throw new InvalidOperationException("Impossible d'ouvrir la connexion USB.");

        connection.ClaimInterface(printerInterface, true);
        try
        {
            await Task.Run(() => connection.BulkTransfer(outEndpoint, data, data.Length, 5000), ct);
        }
        finally
        {
            connection.ReleaseInterface(printerInterface);
        }
    }

    private static UsbManager? GetUsbManager() => Application.Context.GetSystemService(Context.UsbService) as UsbManager;

    private static Task RequestPermissionAsync(Context context, UsbManager manager, UsbDevice device)
    {
        var tcs = new TaskCompletionSource();
        var receiver = new UsbPermissionReceiver(tcs);
        var filter = new IntentFilter(UsbPermissionAction);

        if (OperatingSystem.IsAndroidVersionAtLeast(33))
            context.RegisterReceiver(receiver, filter, ReceiverFlags.Exported);
        else
            context.RegisterReceiver(receiver, filter);

        var intent = new Intent(UsbPermissionAction).SetPackage(context.PackageName);
        var flags = OperatingSystem.IsAndroidVersionAtLeast(31) ? PendingIntentFlags.Mutable : PendingIntentFlags.UpdateCurrent;
        var permissionIntent = PendingIntent.GetBroadcast(context, 0, intent, flags);

        manager.RequestPermission(device, permissionIntent);

        return tcs.Task;
    }

    private class UsbPermissionReceiver : BroadcastReceiver
    {
        private readonly TaskCompletionSource _tcs;
        public UsbPermissionReceiver(TaskCompletionSource tcs) => _tcs = tcs;

        public override void OnReceive(Context? context, Intent? intent)
        {
            try { context?.UnregisterReceiver(this); } catch { /* already unregistered */ }
            _tcs.TrySetResult();
        }
    }
}
