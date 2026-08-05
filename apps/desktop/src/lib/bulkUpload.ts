/**
 * Reads a filled bulk-stock template (.xlsx / .xls / .csv) and returns
 * tab-separated data rows ready for the existing paste-parser. Skips the
 * template's title / instruction / header / guide rows, and fills any blank
 * field with a sensible default so a partly-filled sheet still imports:
 *   barcode → a generated in-store code (2… prefix), prices/threshold → 0,
 *   batch → LOT-<today>, quantity → 1. Rows with no product name are dropped.
 */

const COLS = 9;
const BOILERPLATE = /bulk stock import|product name|fill one product/i;
const GUIDE = new Set(["required", "recommended", "optional", "required for new"]);

export async function readFilledTemplate(file: File): Promise<string> {
  // Lazy-loaded so the (large, CJS) spreadsheet lib never sits in the app's
  // startup bundle — it's only needed the moment someone uploads a file.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("empty");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });

  const lines: string[] = [];
  let dataIndex = 0;
  for (const raw of rows) {
    const cells = Array.from({ length: COLS }, (_, i) => String((raw as unknown[])[i] ?? "").trim());
    const name = cells[0];
    if (!name) continue; // blank row
    if (BOILERPLATE.test(name)) continue; // title / header / instruction
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length > 0 && nonEmpty.every((c) => GUIDE.has(c.toLowerCase()))) continue; // guide row
    applyDefaults(cells, dataIndex++);
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

function applyDefaults(cells: string[], i: number): void {
  // 0 name · 1 barcode · 2 category · 3 purchase · 4 sale · 5 low-stock · 6 batch · 7 expiry · 8 qty
  if (!cells[1]) cells[1] = generatedBarcode(i);
  if (!cells[3]) cells[3] = "0";
  if (!cells[4]) cells[4] = "0";
  if (!cells[5]) cells[5] = "0";
  if (!cells[6]) cells[6] = `LOT-${new Date().toISOString().slice(0, 10)}`;
  if (!(Number(cells[8]) > 0)) cells[8] = "1";
}

/** A 13-digit EAN-style code in the "2…" in-store range reserved for internal
 * products — safe to invent without colliding with real manufacturer barcodes. */
function generatedBarcode(i: number): string {
  const n = 2_000_000_000_000 + (Date.now() % 1_000_000_00) * 10 + (i % 10);
  return String(n).slice(0, 13);
}
