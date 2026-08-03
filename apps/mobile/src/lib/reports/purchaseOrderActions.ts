import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { generatePurchaseOrderHtml } from "./generatePurchaseOrderHtml";
import type { PurchaseOrderPdfData } from "./purchaseOrderPdfTypes";

export async function viewOrPrintPurchaseOrder(data: PurchaseOrderPdfData): Promise<void> {
  const html = generatePurchaseOrderHtml(data);
  await Print.printAsync({ html });
}

export async function sharePurchaseOrder(data: PurchaseOrderPdfData): Promise<void> {
  const html = generatePurchaseOrderHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Purchase order #${data.id.slice(0, 8).toUpperCase()}` });
}
