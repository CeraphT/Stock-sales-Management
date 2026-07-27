namespace PharmaStock.Desktop.Services;

/// <summary>Android 12+ (API 31) requires the runtime-requestable
/// BLUETOOTH_CONNECT permission before touching BluetoothAdapter — there's no
/// built-in Permissions.Bluetooth in MAUI Essentials, so this follows the
/// documented pattern for a custom platform permission. Pre-31 devices use
/// the legacy manifest-only BLUETOOTH/BLUETOOTH_ADMIN permissions instead
/// (see AndroidManifest.xml's maxSdkVersion="30" on those two).</summary>
public class BluetoothConnectPermission : Permissions.BasePlatformPermission
{
#if ANDROID
    public override (string androidPermission, bool isRuntime)[] RequiredPermissions => new List<(string, bool)>
    {
        (global::Android.Manifest.Permission.BluetoothConnect, true),
    }.ToArray();
#endif
}
