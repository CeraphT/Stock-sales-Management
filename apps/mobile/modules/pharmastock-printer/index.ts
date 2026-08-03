import { requireNativeModule } from "expo-modules-core";

export interface NativePrinterDevice {
  id: string;
  name: string;
}

interface PharmastockPrinterModule {
  // Bluetooth (Classic SPP, bonded devices only — no discovery/scan).
  discoverBluetooth(): Promise<NativePrinterDevice[]>;
  hasBluetoothPermission(): Promise<boolean>;
  requestBluetoothPermission(): Promise<boolean>;
  isBluetoothEnabled(): Promise<boolean>;
  requestEnableBluetooth(): Promise<void>;
  openBluetoothSettings(): Promise<void>;
  sendBluetooth(deviceId: string, bytes: number[]): Promise<void>;

  // USB Host raw bulk transfer.
  discoverUsb(): Promise<NativePrinterDevice[]>;
  hasUsbPermission(deviceId: string): Promise<boolean>;
  requestUsbPermission(deviceId: string): Promise<boolean>;
  sendUsb(deviceId: string, bytes: number[]): Promise<void>;
}

export default requireNativeModule<PharmastockPrinterModule>("PharmastockPrinter");
