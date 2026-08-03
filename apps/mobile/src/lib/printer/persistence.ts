import * as SecureStore from "expo-secure-store";

import { PrinterConnectionType, type PrinterDevice } from "./types";

// Mirrors the MAUI client's ReceiptPrintingService, which persists the
// chosen printer via MAUI Preferences under three keys — same shape here,
// just backed by expo-secure-store (already a dependency, no server round
// trip, survives app restarts, one entry per device).
const KEY_ID = "printer_device_id";
const KEY_NAME = "printer_device_name";
const KEY_TYPE = "printer_connection_type";

export async function getSelectedPrinter(): Promise<PrinterDevice | null> {
  const [id, name, type] = await Promise.all([
    SecureStore.getItemAsync(KEY_ID),
    SecureStore.getItemAsync(KEY_NAME),
    SecureStore.getItemAsync(KEY_TYPE),
  ]);
  if (!id || !name || !type) return null;
  if (type !== PrinterConnectionType.Bluetooth && type !== PrinterConnectionType.Usb) return null;
  return { id, name, connectionType: type };
}

export async function setSelectedPrinter(device: PrinterDevice): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_ID, device.id),
    SecureStore.setItemAsync(KEY_NAME, device.name),
    SecureStore.setItemAsync(KEY_TYPE, device.connectionType),
  ]);
}

export async function clearSelectedPrinter(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ID),
    SecureStore.deleteItemAsync(KEY_NAME),
    SecureStore.deleteItemAsync(KEY_TYPE),
  ]);
}
