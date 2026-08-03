import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { generateReportHtml } from "./generateReportHtml";
import type { ReportData } from "./reportTypes";

/** Opens Android's native print preview for the report — doubles as a
 * page-accurate PDF preview with a built-in "Save as PDF" option. */
export async function viewOrPrintReport(data: ReportData): Promise<void> {
  const html = generateReportHtml(data);
  await Print.printAsync({ html });
}

/** Renders the report to a PDF file and opens the share sheet — email,
 * WhatsApp, Drive, anything the device offers. */
export async function shareReport(data: ReportData): Promise<void> {
  const html = generateReportHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Sales report" });
}
