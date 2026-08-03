export enum PrinterConnectionType {
  Bluetooth = "Bluetooth",
  Usb = "Usb",
}

export interface PrinterDevice {
  id: string;
  name: string;
  connectionType: PrinterConnectionType;
}

export class NoPrinterConfiguredError extends Error {
  constructor() {
    super("No receipt printer configured yet.");
    this.name = "NoPrinterConfiguredError";
  }
}
