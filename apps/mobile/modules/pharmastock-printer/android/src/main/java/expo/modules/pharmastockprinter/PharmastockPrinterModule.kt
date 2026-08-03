package expo.modules.pharmastockprinter

import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

// TS/RN port of the MAUI client's BluetoothPrinterTransport.cs +
// UsbPrinterTransport.cs — same raw Android APIs (no third-party Bluetooth
// library, no vendor USB SDK), same "bonded devices only, no discovery
// scan" restriction for Bluetooth, same "first OUT bulk endpoint wins"
// naive USB interface selection. Kept close to the original so the two
// clients behave identically against the same printer hardware.

private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
private const val USB_PERMISSION_ACTION = "com.pharmastock.expo.USB_PERMISSION"

class PrinterException(message: String) : CodedException(message)

class PharmastockPrinterModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw PrinterException("No application context available.")

  override fun definition() = ModuleDefinition {
    Name("PharmastockPrinter")

    // ---- Bluetooth ----

    AsyncFunction("discoverBluetooth") {
      discoverBluetoothDevices()
    }

    AsyncFunction("hasBluetoothPermission") {
      hasBluetoothConnectPermission()
    }

    AsyncFunction("requestBluetoothPermission") { promise: Promise ->
      requestBluetoothConnectPermission(promise)
    }

    AsyncFunction("isBluetoothEnabled") {
      getAdapter()?.isEnabled ?: false
    }

    AsyncFunction("requestEnableBluetooth") {
      val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("openBluetoothSettings") {
      val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("sendBluetooth") { deviceId: String, bytes: List<Int> ->
      sendViaBluetooth(deviceId, bytes.map { it.toByte() }.toByteArray())
    }

    // ---- USB ----

    AsyncFunction("discoverUsb") {
      discoverUsbDevices()
    }

    AsyncFunction("hasUsbPermission") { deviceId: String ->
      val device = findUsbDevice(deviceId)
      device != null && getUsbManager().hasPermission(device)
    }

    AsyncFunction("requestUsbPermission") { deviceId: String, promise: Promise ->
      val device = findUsbDevice(deviceId)
      if (device == null) {
        promise.reject(PrinterException("USB printer not found — check it's plugged in."))
      } else {
        requestUsbPermission(device, promise)
      }
    }

    AsyncFunction("sendUsb") { deviceId: String, bytes: List<Int> ->
      sendViaUsb(deviceId, bytes.map { it.toByte() }.toByteArray())
    }
  }

  // ---- Bluetooth ----

  private fun getAdapter(): BluetoothAdapter? {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  private fun hasBluetoothConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return ContextCompat.checkSelfPermission(context, android.Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun requestBluetoothConnectPermission(promise: Promise) {
    if (hasBluetoothConnectPermission()) {
      promise.resolve(true)
      return
    }
    val permissions = appContext.permissions
    if (permissions == null) {
      promise.reject(PrinterException("Permissions module unavailable."))
      return
    }
    permissions.askForPermissions(
      { result ->
        val granted = result.values.all { it.status == expo.modules.interfaces.permissions.PermissionsStatus.GRANTED }
        promise.resolve(granted)
      },
      android.Manifest.permission.BLUETOOTH_CONNECT,
    )
  }

  @Suppress("MissingPermission")
  private fun discoverBluetoothDevices(): List<Map<String, String>> {
    if (!hasBluetoothConnectPermission()) {
      throw PrinterException("Bluetooth permission not granted.")
    }
    val adapter = getAdapter() ?: throw PrinterException("Bluetooth is not available on this device.")
    // Bonded devices only — pairing itself happens in Android's own
    // Bluetooth settings (openBluetoothSettings), so no discovery/scan
    // permission is ever requested here.
    return adapter.bondedDevices
      .filter { !it.address.isNullOrEmpty() }
      .map { mapOf("id" to it.address, "name" to (it.name ?: it.address)) }
  }

  @Suppress("MissingPermission")
  private fun sendViaBluetooth(deviceId: String, data: ByteArray) {
    if (!hasBluetoothConnectPermission()) {
      throw PrinterException("Bluetooth permission not granted.")
    }
    val adapter = getAdapter() ?: throw PrinterException("Bluetooth is not available on this device.")
    val device = adapter.bondedDevices.find { it.address == deviceId }
      ?: throw PrinterException("Bluetooth printer not found — check it's still paired in Bluetooth settings.")

    adapter.cancelDiscovery()

    val socket: BluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
      ?: throw PrinterException("Could not create a Bluetooth connection.")

    try {
      socket.connect()
      socket.outputStream.write(data)
      socket.outputStream.flush()
    } finally {
      socket.close()
    }
  }

  // ---- USB ----

  private fun getUsbManager(): UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

  private fun findUsbDevice(deviceId: String): UsbDevice? =
    getUsbManager().deviceList.values.find { it.deviceName == deviceId }

  private fun discoverUsbDevices(): List<Map<String, String>> =
    getUsbManager().deviceList.values.map {
      mapOf("id" to it.deviceName, "name" to (it.productName ?: "USB device (${it.deviceName})"))
    }

  private fun requestUsbPermission(device: UsbDevice, promise: Promise) {
    val manager = getUsbManager()
    if (manager.hasPermission(device)) {
      promise.resolve(true)
      return
    }

    lateinit var receiver: BroadcastReceiver
    receiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context, intent: Intent) {
        if (intent.action != USB_PERMISSION_ACTION) return
        try {
          receiverContext.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
          // Already unregistered — ignore.
        }
        promise.resolve(manager.hasPermission(device))
      }
    }

    val filter = IntentFilter(USB_PERMISSION_ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }

    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_MUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val permissionIntent = PendingIntent.getBroadcast(context, 0, Intent(USB_PERMISSION_ACTION), flags)
    manager.requestPermission(device, permissionIntent)
  }

  private fun sendViaUsb(deviceId: String, data: ByteArray) {
    val manager = getUsbManager()
    val device = findUsbDevice(deviceId) ?: throw PrinterException("USB printer not found — check it's plugged in.")
    if (!manager.hasPermission(device)) {
      throw PrinterException("USB permission not granted for this printer.")
    }

    var outEndpoint: android.hardware.usb.UsbEndpoint? = null
    var usbInterface: android.hardware.usb.UsbInterface? = null
    outer@ for (i in 0 until device.interfaceCount) {
      val iface = device.getInterface(i)
      for (e in 0 until iface.endpointCount) {
        val endpoint = iface.getEndpoint(e)
        if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
          outEndpoint = endpoint
          usbInterface = iface
          break@outer
        }
      }
    }
    val endpoint = outEndpoint ?: throw PrinterException("No compatible USB output endpoint found on this printer.")
    val iface = usbInterface ?: throw PrinterException("No compatible USB output endpoint found on this printer.")

    val connection = manager.openDevice(device) ?: throw PrinterException("Could not open the USB connection.")
    try {
      connection.claimInterface(iface, true)
      connection.bulkTransfer(endpoint, data, data.size, 5000)
    } finally {
      connection.releaseInterface(iface)
      connection.close()
    }
  }
}
