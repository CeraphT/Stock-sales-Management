import { parseFilledSheetRows } from "@stockflow/core/bulk/bulkTemplate";

/**
 * Reads a filled bulk-stock template (.xlsx / .xls / .csv) and returns
 * tab-separated data rows ready for the existing paste-parser. The
 * boilerplate-skipping + default-filling lives in @stockflow/core/bulk/
 * bulkTemplate (shared with mobile); here we just read the file into a
 * workbook with SheetJS and hand its rows over.
 */
export async function readFilledTemplate(file: File): Promise<string> {
  // Lazy-loaded so the (large, CJS) spreadsheet lib never sits in the app's
  // startup bundle — it's only needed the moment someone uploads a file.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("empty");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  return parseFilledSheetRows(rows);
}
