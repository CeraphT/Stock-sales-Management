using Android.Bluetooth;
using Android.Content;
using Java.Util;
using PharmaStock.Desktop.Services;
using Application = Android.App.Application;

namespace PharmaStock.Desktop.Platforms.Android.Services;

/// <summary>Sends raw ESC/POS bytes to an already-paired thermal printer over
/// classic Bluetooth SPP (the standard these mini receipt printers speak).
/// Only ever touches BondedDevices — pairing itself still happens in
/// Android's own Bluetooth settings (OpenPairingSettingsAsync jumps straight
/// there), so no discovery/scan permission is needed here (see
/// AndroidManifest.xml) — just the runtime CONNECT permission and the
/// adapter being switched on, both handled by EnsureTransportReadyAsync.</summary>
public class BluetoothPrinterTransport : IPrinterTransport
{
    // Standard Serial Port Profile UUID — universal across ESC/POS Bluetooth printers.
    private static readonly UUID SppUuid = UUID.FromString("00001101-0000-1000-8000-00805F9B34FB")!;

    public PrinterConnectionType ConnectionType => PrinterConnectionType.Bluetooth;
    public bool HasPairingSettingsScreen => true;

    public async Task<List<PrinterDevice>> DiscoverAsync(CancellationToken ct = default)
    {
        if (!await HasPermissionAsync()) return new List<PrinterDevice>();

        var adapter = GetAdapter();
        if (adapter is null || !adapter.IsEnabled)
            return new List<PrinterDevice>();

        return adapter.BondedDevices?
            .Where(d => !string.IsNullOrEmpty(d.Address))
            .Select(d => new PrinterDevice(d.Address!, d.Name ?? d.Address!, PrinterConnectionType.Bluetooth))
            .ToList() ?? new List<PrinterDevice>();
    }

    public async Task SendAsync(PrinterDevice device, byte[] data, CancellationToken ct = default)
    {
        if (!await HasPermissionAsync())
            throw new InvalidOperationException("Permission Bluetooth refusée.");

        await Task.Run(() =>
        {
            var adapter = GetAdapter()
                ?? throw new InvalidOperationException("Le Bluetooth n'est pas disponible sur cet appareil.");
            var bondedDevice = adapter.BondedDevices?.FirstOrDefault(d => d.Address == device.Id)
                ?? throw new InvalidOperationException("Imprimante Bluetooth introuvable — vérifiez qu'elle est bien appairée dans les réglages Bluetooth.");

            adapter.CancelDiscovery();

            using var socket = bondedDevice.CreateRfcommSocketToServiceRecord(SppUuid)
                ?? throw new InvalidOperationException("Impossible de créer la connexion Bluetooth.");

            socket.Connect();
            try
            {
                var stream = socket.OutputStream ?? throw new InvalidOperationException("Flux d'impression indisponible.");
                stream.Write(data);
                stream.Flush();
            }
            finally
            {
                socket.Close();
            }
        }, ct);
    }

    // Requests the runtime permission if needed, and — if the radio itself
    // is off — fires the OS "Turn on Bluetooth?" dialog. There's no clean
    // awaitable result from that dialog without extra ActivityResult
    // plumbing, so this is fire-and-forget: the caller (PrinterSettingsPage)
    // tells the user to hit "Actualiser" again once they've confirmed it.
    public async Task<bool> EnsureTransportReadyAsync(CancellationToken ct = default)
    {
        if (!await HasPermissionAsync()) return false;

        var adapter = GetAdapter();
        if (adapter is null) return false;
        if (adapter.IsEnabled) return true;

        var intent = new Intent(BluetoothAdapter.ActionRequestEnable);
        intent.AddFlags(ActivityFlags.NewTask);
        Application.Context.StartActivity(intent);
        return false;
    }

    // Bonded Bluetooth devices are already authorized the moment they're
    // paired — nothing extra to grant per-device, unlike USB.
    public Task<bool> EnsureDeviceAuthorizedAsync(PrinterDevice device, CancellationToken ct = default) =>
        Task.FromResult(true);

    public Task OpenPairingSettingsAsync()
    {
        var intent = new Intent(global::Android.Provider.Settings.ActionBluetoothSettings);
        intent.AddFlags(ActivityFlags.NewTask);
        Application.Context.StartActivity(intent);
        return Task.CompletedTask;
    }

    private static BluetoothAdapter? GetAdapter() =>
        (Application.Context.GetSystemService(Context.BluetoothService) as BluetoothManager)?.Adapter;

    private static async Task<bool> HasPermissionAsync()
    {
        if (!OperatingSystem.IsAndroidVersionAtLeast(31)) return true;

        var status = await Permissions.CheckStatusAsync<BluetoothConnectPermission>();
        if (status != PermissionStatus.Granted)
            status = await Permissions.RequestAsync<BluetoothConnectPermission>();
        return status == PermissionStatus.Granted;
    }
}
