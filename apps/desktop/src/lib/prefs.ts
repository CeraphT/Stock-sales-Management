import { create } from "zustand";

/** Local, per-install workflow + printing preferences (not synced to the
 * server). Kept client-side because they govern this device's data-entry
 * guardrails and how it prints, not shared business data. */
const KEY = "pharmastock-prefs";

export type ReceiptWidth = "58mm" | "80mm" | "a4";

interface Prefs {
  /** When false (default), a product must have a supplier before it can be
   * saved. Enable to register existing stock that has no known supplier. */
  allowProductsWithoutSupplier: boolean;
  /** Receipt paper width — narrow thermal rolls (58/80mm) or a full A4 page. */
  receiptWidth: ReceiptWidth;
  /** Print the receipt automatically right after a sale completes. */
  autoPrintReceipt: boolean;
  /** How many copies of each receipt to print. */
  receiptCopies: number;
  /** When on, RECEIPTS ONLY go straight to a thermal printer as raw ESC/POS
   * bytes (no OS dialog); reports/PDFs still use the system print dialog. */
  thermalEnabled: boolean;
  /** How the receipt printer connects. USB and Bluetooth (paired → virtual COM
   * port on Windows) both use the serial transport; network uses TCP. Set
   * automatically by auto-detect — the user never picks this. */
  thermalConnection: "usb" | "bluetooth" | "network";
  /** The connection handle (COM port, or host:port for network). Set by
   * auto-detect / the network fallback, not typed by hand. */
  thermalTarget: string;
  /** Friendly name of the connected printer, shown in the UI. */
  thermalLabel: string;
  thermalBaud: number;
}

/** The native transport a connection type uses (Bluetooth SPP = a COM port). */
export function transportKind(c: Prefs["thermalConnection"]): "serial" | "network" {
  return c === "network" ? "network" : "serial";
}

const DEFAULTS: Prefs = {
  allowProductsWithoutSupplier: false,
  receiptWidth: "80mm",
  autoPrintReceipt: false,
  receiptCopies: 1,
  thermalEnabled: false,
  thermalConnection: "usb",
  thermalTarget: "",
  thermalLabel: "",
  thermalBaud: 9600,
};

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ignore malformed */
  }
  return DEFAULTS;
}

/** Pixel width for a receipt paper size (~3.78px/mm), used in the receipt CSS. */
export function receiptWidthPx(w: ReceiptWidth): number {
  return w === "58mm" ? 220 : w === "a4" ? 700 : 302;
}

interface PrefsState extends Prefs {
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...read(),
  set: (key, value) => {
    set({ [key]: value } as unknown as Partial<PrefsState>);
    const { allowProductsWithoutSupplier, receiptWidth, autoPrintReceipt, receiptCopies, thermalEnabled, thermalConnection, thermalTarget, thermalLabel, thermalBaud } = get();
    localStorage.setItem(
      KEY,
      JSON.stringify({ allowProductsWithoutSupplier, receiptWidth, autoPrintReceipt, receiptCopies, thermalEnabled, thermalConnection, thermalTarget, thermalLabel, thermalBaud }),
    );
  },
}));
