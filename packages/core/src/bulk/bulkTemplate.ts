/** Shared bulk-stock template helpers used by BOTH clients:
 *  - buildTemplateWorkbook(): the styled .xls (an HTML table Excel/Sheets opens
 *    with formatting intact) users download, fill, and re-import.
 *  - parseFilledSheetRows(): turn a filled sheet's 2D cell rows into the same
 *    tab-separated text the paste-parser (parseBulkStock) already handles,
 *    skipping the template's title/header/guide rows and filling blanks with
 *    sensible defaults.
 * Each client supplies the platform bits: reading the picked file into a
 * workbook (SheetJS), and writing/sharing the template file. */

const TEMPLATE_COLUMNS: { h: string; ex1: string; ex2: string; req: string; w: number; text?: boolean }[] = [
  { h: "Product Name", ex1: "Paracetamol 500mg", ex2: "Amoxicillin 250mg", req: "Required", w: 170 },
  { h: "Barcode", ex1: "6009123456789", ex2: "6009123456790", req: "Recommended", w: 140, text: true },
  { h: "Category", ex1: "Pain Relief", ex2: "Antibiotics", req: "Required for new", w: 130 },
  { h: "Purchase Price", ex1: "150", ex2: "300", req: "Required for new", w: 110 },
  { h: "Sale Price", ex1: "250", ex2: "500", req: "Required for new", w: 100 },
  { h: "Low Stock Threshold", ex1: "20", ex2: "10", req: "Optional", w: 140 },
  { h: "Batch Number", ex1: "LOT-2026-01", ex2: "LOT-2026-02", req: "Optional", w: 120 },
  { h: "Expiry (YYYY-MM-DD)", ex1: "2027-06-30", ex2: "2027-12-31", req: "Optional", w: 150, text: true },
  { h: "Quantity", ex1: "100", ex2: "50", req: "Required", w: 90 },
];
const COL_COUNT = TEMPLATE_COLUMNS.length;

/** A styled workbook that opens in Excel/Sheets with colour, borders and column
 * widths — not a bare CSV. It's an HTML table saved with an .xls extension,
 * which Excel renders with all the inline styling intact. Barcode/expiry cells
 * are forced to text so long codes don't turn into scientific notation. */
export function buildTemplateWorkbook(): string {
  const C = {
    primary: "#4F46E5",
    background: "#F5F8F7",
    surface: "#FFFFFF",
    border: "#E3E7E5",
    text: "#1F2937",
    textSecondary: "#6B7280",
  };
  const cell = (v: string, style: string) => `<td style="${style}">${v}</td>`;
  const headStyle = `background:${C.primary};color:#FFFFFF;font-weight:bold;border:1px solid ${C.border};padding:7px 8px;text-align:center;font-size:11px;`;
  const guideStyle = `background:${C.background};color:${C.textSecondary};border:1px solid ${C.border};padding:3px 8px;text-align:center;font-size:9px;font-style:italic;`;
  const exStyle = (bg: string, text?: boolean) =>
    `background:${bg};color:${C.text};border:1px solid ${C.border};padding:5px 8px;font-size:11px;${text ? "mso-number-format:'\\@';" : ""}`;

  const headerRow = `<tr>${TEMPLATE_COLUMNS.map((c) => `<td width="${c.w}" style="${headStyle}">${c.h}</td>`).join("")}</tr>`;
  const guideRow = `<tr>${TEMPLATE_COLUMNS.map((c) => cell(c.req, guideStyle)).join("")}</tr>`;
  const ex1 = `<tr>${TEMPLATE_COLUMNS.map((c) => cell(c.ex1, exStyle(C.background, c.text))).join("")}</tr>`;
  const ex2 = `<tr>${TEMPLATE_COLUMNS.map((c) => cell(c.ex2, exStyle(C.surface, c.text))).join("")}</tr>`;
  const blank = `<tr>${TEMPLATE_COLUMNS.map((c) => cell("&nbsp;", exStyle(C.surface, c.text) + "height:22px;")).join("")}</tr>`;

  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>Bulk Stock</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>` +
    `</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>` +
    `<table cellspacing="0" cellpadding="0" border="0" style="font-family:Segoe UI,Arial,sans-serif;border-collapse:collapse;">` +
    `<tr><td colspan="${COL_COUNT}" style="background:${C.primary};color:#FFFFFF;font-size:18px;font-weight:bold;padding:12px 10px;">` +
    `📦 Bulk Stock Import Template</td></tr>` +
    `<tr><td colspan="${COL_COUNT}" style="background:${C.background};color:${C.text};padding:8px 10px;font-size:11px;border:1px solid ${C.border};">` +
    `Fill one product per row under the examples, then copy your rows into the app's “Paste product rows” box. ` +
    `Delete the two example rows first. Barcode matches an existing product; otherwise the exact name is used.` +
    `</td></tr>` +
    `<tr><td colspan="${COL_COUNT}" style="height:6px;"></td></tr>` +
    headerRow +
    guideRow +
    ex1 +
    ex2 +
    blank +
    blank +
    blank +
    `</table></body></html>`
  );
}

const COLS = 9;
const BOILERPLATE = /bulk stock import|product name|fill one product/i;
const GUIDE = new Set(["required", "recommended", "optional", "required for new"]);

/** A 13-digit EAN-style code in the "2…" in-store range reserved for internal
 * products — safe to invent without colliding with real manufacturer barcodes. */
function generatedBarcode(i: number): string {
  const n = 2_000_000_000_000 + (Date.now() % 1_000_000_00) * 10 + (i % 10);
  return String(n).slice(0, 13);
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

/** Turn a filled template's 2D cell rows (SheetJS sheet_to_json header:1) into
 * tab-separated data lines for the paste-parser. Skips the title / instruction
 * / header / guide rows and fills blanks with defaults; rows with no product
 * name are dropped. */
export function parseFilledSheetRows(rows: unknown[][]): string {
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
