import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { generateListHtml, type SalesListData } from "./generateListHtml";

export async function viewOrPrintList(data: SalesListData): Promise<void> {
  const html = generateListHtml(data);
  await Print.printAsync({ html });
}

export async function shareList(data: SalesListData): Promise<void> {
  const html = generateListHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: data.title });
}
