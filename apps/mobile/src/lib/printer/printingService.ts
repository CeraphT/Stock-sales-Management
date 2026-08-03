import PharmastockPrinter, { type NativePrinterDevice } from "pharmastock-printer";

import type { ReceiptData } from "@/lib/receipt/receiptTypes";

import { buildEscPosReceipt, buildEscPosTestPage } from "./escpos";
import { clearSelectedPrinter, getSelectedPrinter, setSelectedPrinter } from "./persistence";
import { NoPrinterConfiguredError, PrinterConnectionType, type PrinterDevice } from "./types";

function toDevices(list: NativePrinterDevice[], type: PrinterConnectionType): PrinterDevice[] {
  return list.map((d) => ({ id: d.id, name: d.name, connectionType: type }));
}

function toNativeBytes(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

/** TS port of the MAUI client's ReceiptPrintingService — discovers devices
 * across both transports, persists the chosen one, and sends a built
 * ESC/POS byte sequence to it. */
export const printingService = {
  getSelectedPrinter,
  clearSelectedPrinter,

  async selectPrinter(device: PrinterDevice): Promise<void> {
    await setSelectedPrinter(device);
  },

  /** Combines Bluetooth (bonded devices only) + USB (currently attached)
   * into one flat list — same "discover everything, every refresh" shape
   * as the MAUI settings page. Bluetooth permission/adapter-on prompts are
   * triggered here if needed; if Bluetooth isn't ready yet this returns
   * just the USB devices for this pass (matching the original's "hit
   * refresh again after confirming" flow). */
  async discoverAll(): Promise<PrinterDevice[]> {
    const usb = toDevices(await PharmastockPrinter.discoverUsb(), PrinterConnectionType.Usb);

    let hasPermission = await PharmastockPrinter.hasBluetoothPermission();
    if (!hasPermission) {
      hasPermission = await PharmastockPrinter.requestBluetoothPermission();
    }
    if (!hasPermission) return usb;

    const enabled = await PharmastockPrinter.isBluetoothEnabled();
    if (!enabled) {
      await PharmastockPrinter.requestEnableBluetooth();
      return usb;
    }

    const bluetooth = toDevices(await PharmastockPrinter.discoverBluetooth(), PrinterConnectionType.Bluetooth);
    return [...bluetooth, ...usb];
  },

  openBluetoothPairingSettings(): Promise<void> {
    return PharmastockPrinter.openBluetoothSettings();
  },

  /** USB requires a per-device runtime grant (the Android system "Allow
   * this app to access the USB device?" dialog) — Bluetooth doesn't need
   * anything beyond the one-time BLUETOOTH_CONNECT permission already
   * checked during discovery. Returns whether the device is ready to
   * print to. */
  async ensureDeviceAuthorized(device: PrinterDevice): Promise<boolean> {
    if (device.connectionType === PrinterConnectionType.Usb) {
      const already = await PharmastockPrinter.hasUsbPermission(device.id);
      if (already) return true;
      return PharmastockPrinter.requestUsbPermission(device.id);
    }
    return true;
  },

  async printTestPage(device: PrinterDevice, companyName: string, currency: string): Promise<void> {
    const bytes = buildEscPosTestPage(companyName, currency);
    await sendTo(device, bytes);
  },

  async printReceipt(data: ReceiptData): Promise<void> {
    const device = await getSelectedPrinter();
    if (!device) throw new NoPrinterConfiguredError();
    const bytes = buildEscPosReceipt(data);
    await sendTo(device, bytes);
  },
};

async function sendTo(device: PrinterDevice, bytes: Uint8Array): Promise<void> {
  const payload = toNativeBytes(bytes);
  if (device.connectionType === PrinterConnectionType.Bluetooth) {
    await PharmastockPrinter.sendBluetooth(device.id, payload);
  } else {
    await PharmastockPrinter.sendUsb(device.id, payload);
  }
}

export { NoPrinterConfiguredError, PrinterConnectionType, type PrinterDevice } from "./types";
