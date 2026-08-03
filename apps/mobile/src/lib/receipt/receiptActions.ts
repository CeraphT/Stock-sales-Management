import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { generateReceiptHtml } from "./generateReceiptHtml";
import type { ReceiptData } from "./receiptTypes";

/** Opens Android's native print preview for the receipt — a genuine
 * page-accurate preview, with a built-in "Save as PDF" virtual printer
 * (that's the "download" path) and real printing if a printer is
 * available (useful groundwork for Phase 8's receipt printer feature). */
export async function viewOrPrintReceipt(data: ReceiptData): Promise<void> {
  const html = generateReceiptHtml(data);
  await Print.printAsync({ html });
}

/** Renders the receipt to an actual PDF file and opens the share sheet —
 * for sending it directly (WhatsApp, email, Files/Drive to save) without
 * going through the print dialog. */
export async function shareReceipt(data: ReceiptData): Promise<void> {
  const html = generateReceiptHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Receipt" });
}
