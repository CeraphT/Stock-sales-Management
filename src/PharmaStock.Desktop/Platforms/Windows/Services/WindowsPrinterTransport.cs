using System.Runtime.InteropServices;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Platforms.Windows.Services;

/// <summary>Sends raw ESC/POS bytes to a receipt printer through the Windows
/// Print Spooler (winspool.drv) — the standard way desktop POS software
/// talks to receipt printers on Windows. Once a thermal printer (USB or
/// Bluetooth) has its driver installed via Settings > Printers &amp; scanners,
/// it shows up here like any other printer and raw bytes go straight through
/// with the "RAW" datatype, no vendor SDK needed. This mirrors what
/// BluetoothPrinterTransport/UsbPrinterTransport do for Android, just
/// through the OS spooler instead of talking to the radio/bus directly,
/// since Windows already owns that layer for every printer, not just
/// thermal ones.</summary>
public class WindowsPrinterTransport : IPrinterTransport
{
    public PrinterConnectionType ConnectionType => PrinterConnectionType.Windows;

    // Links to Windows' own printer-management surface — installing a
    // Bluetooth/USB thermal printer's driver happens there, not in this app.
    public bool HasPairingSettingsScreen => true;

    public Task<List<PrinterDevice>> DiscoverAsync(CancellationToken ct = default)
    {
        var devices = EnumerateLocalPrinterNames()
            .Select(name => new PrinterDevice(name, name, PrinterConnectionType.Windows))
            .ToList();
        return Task.FromResult(devices);
    }

    // Nothing global to prepare — the Windows print spooler service is
    // always running; per-printer readiness is whatever driver install
    // state Windows itself already tracks.
    public Task<bool> EnsureTransportReadyAsync(CancellationToken ct = default) => Task.FromResult(true);

    // Any printer visible to EnumPrinters is already usable by any app on
    // the machine — Windows has no extra per-app grant like Android's USB
    // permission prompt.
    public Task<bool> EnsureDeviceAuthorizedAsync(PrinterDevice device, CancellationToken ct = default) => Task.FromResult(true);

    public Task OpenPairingSettingsAsync()
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("ms-settings:printers") { UseShellExecute = true });
        }
        catch { /* best effort — user can also reach it from the Start menu */ }
        return Task.CompletedTask;
    }

    public Task SendAsync(PrinterDevice device, byte[] data, CancellationToken ct = default) =>
        Task.Run(() => RawPrint(device.Name, data), ct);

    private static void RawPrint(string printerName, byte[] data)
    {
        if (!OpenPrinterW(printerName, out var hPrinter, IntPtr.Zero))
            throw new InvalidOperationException($"Impossible d'ouvrir l'imprimante « {printerName} ».");

        try
        {
            var docInfo = new DocInfo1W { pDocName = "Reçu PharmaStock", pDataType = "RAW" };
            var docHandle = StartDocPrinterW(hPrinter, 1, docInfo);
            if (docHandle == 0)
                throw new InvalidOperationException("Impossible de démarrer l'impression.");

            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new InvalidOperationException("Impossible de démarrer la page d'impression.");

                try
                {
                    var buffer = Marshal.AllocHGlobal(data.Length);
                    try
                    {
                        Marshal.Copy(data, 0, buffer, data.Length);
                        if (!WritePrinter(hPrinter, buffer, data.Length, out _))
                            throw new InvalidOperationException("Échec de l'envoi des données à l'imprimante.");
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(buffer);
                    }
                }
                finally
                {
                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }

    // Two-pass EnumPrinters: first call (null buffer) fails but reports the
    // required buffer size via pcbNeeded, then the real call fills it.
    private static List<string> EnumerateLocalPrinterNames()
    {
        const uint printerEnumLocal = 0x2;
        const uint printerEnumConnections = 0x4;
        const uint flags = printerEnumLocal | printerEnumConnections;

        EnumPrintersW(flags, null, 4, IntPtr.Zero, 0, out var neededBytes, out _);
        if (neededBytes == 0) return new List<string>();

        var buffer = Marshal.AllocHGlobal((int)neededBytes);
        try
        {
            if (!EnumPrintersW(flags, null, 4, buffer, neededBytes, out _, out var returned))
                return new List<string>();

            var names = new List<string>();
            var structSize = Marshal.SizeOf<PrinterInfo4W>();
            for (var i = 0; i < returned; i++)
            {
                var info = Marshal.PtrToStructure<PrinterInfo4W>(buffer + i * structSize);
                if (!string.IsNullOrWhiteSpace(info.pPrinterName))
                    names.Add(info.pPrinterName);
            }
            return names;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PrinterInfo4W
    {
        public string pPrinterName;
        public string pServerName;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DocInfo1W
    {
        public string? pDocName;
        public string? pOutputFile;
        public string? pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinterW(string printerName, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinterW(IntPtr hPrinter, int level, DocInfo1W docInfo);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool EnumPrintersW(uint flags, string? name, uint level, IntPtr pPrinterEnum, uint cbBuf, out uint pcbNeeded, out uint pcReturned);
}
