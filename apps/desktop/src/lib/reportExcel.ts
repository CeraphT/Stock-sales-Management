import { FR } from "@/lib/i18n";
import { printColoredReport } from "@/lib/reportPdf";
import { useLanguageStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

/** Same options as printColoredReport, so every report can go to PDF or Excel
 * from one description. */
export type ReportOptions = Parameters<typeof printColoredReport>[0];
export type ReportFormat = "pdf" | "xlsx";

/** Tauri exposes this global inside the native webview; absent in a plain browser. */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The browser locale's group / decimal separators, the ones toLocaleString()
 * (and therefore formatCurrency) used to build the cells. */
function separators(): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat().formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  };
}

/** "12 500,5 XAF" / "- 1,234 XAF" / "7" -> number; anything else stays text.
 * Only used on right-aligned (amount / quantity) columns. */
function toNumber(cell: string, sep: { group: string; decimal: string }): number | null {
  let s = cell.trim().replace(/[\s  ]+/g, " ");
  const negative = /^[-−]\s*/.test(s);
  s = s.replace(/^[-−]\s*/, "");
  const m = s.match(/^([\d\s.,'  ]+)(?:\s+\S.*)?$/);
  if (!m) return null;
  let digits = m[1].trim();
  if (sep.group.trim() === "") digits = digits.replace(/\s/g, "");
  else digits = digits.split(sep.group).join("").replace(/\s/g, "");
  digits = digits.replace(sep.decimal, ".");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const n = Number(digits);
  return negative ? -n : n;
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|·→…]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "report";
}

/** Builds a styled .xlsx (teal header band like the PDF, frozen header row,
 * autofilter, real numbers in amount columns) and saves it: Downloads folder
 * natively, a normal browser download otherwise. */
export async function exportReportExcel(opts: ReportOptions): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const accent = (opts.accent ?? "#0F766E").replace("#", "").toUpperCase();
  const argb = `FF${accent}`;
  const sep = separators();
  const cols = opts.columns;
  const numeric = (j: number) => cols[j]?.align === "right";
  const cell = (v: string | null, j: number): string | number | null => {
    if (v == null) return null;
    if (!numeric(j)) return v;
    return toNumber(v, sep) ?? v;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "StockFlow";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " ") || "Report");

  // Header block: business, title, subtitle, meta chips.
  const lastCol = Math.max(cols.length, 1);
  const headerLines: { text: string; bold?: boolean; size?: number }[] = [
    { text: [opts.companyName, opts.contact, opts.taxId ? `NIU ${opts.taxId}` : null].filter(Boolean).join(" · "), size: 10 },
    { text: opts.title, bold: true, size: 15 },
  ];
  if (opts.subtitle) headerLines.push({ text: opts.subtitle, size: 10 });
  if (opts.meta?.length) headerLines.push({ text: opts.meta.map((m) => `${m.label}: ${m.value}`).join("   ·   "), size: 10 });
  for (const line of headerLines) {
    const row = ws.addRow([line.text]);
    ws.mergeCells(row.number, 1, row.number, lastCol);
    row.getCell(1).font = { bold: line.bold, size: line.size, color: { argb: "FFFFFFFF" } };
    for (let c = 1; c <= lastCol; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
  ws.addRow([]);

  // Table header.
  const head = ws.addRow(cols.map((c) => c.header));
  head.eachCell((c, j) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    c.alignment = { horizontal: numeric(j - 1) ? "right" : "left", vertical: "middle" };
  });
  const headerRow = head.number;

  // Body.
  opts.rows.forEach((r, i) => {
    const row = ws.addRow(r.map((v, j) => cell(v, j)));
    row.eachCell({ includeEmpty: true }, (c, j) => {
      if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8F7" } };
      if (typeof c.value === "number") c.numFmt = Number.isInteger(c.value) ? "#,##0" : "#,##0.##";
      c.alignment = { horizontal: numeric(j - 1) ? "right" : "left" };
    });
  });
  const lastBodyRow = headerRow + opts.rows.length;

  // Totals.
  if (opts.totals) {
    const row = ws.addRow(opts.totals.map((v, j) => cell(v, j)));
    row.eachCell({ includeEmpty: true }, (c, j) => {
      c.font = { bold: true };
      c.border = { top: { style: "medium", color: { argb } } };
      if (typeof c.value === "number") c.numFmt = Number.isInteger(c.value) ? "#,##0" : "#,##0.##";
      c.alignment = { horizontal: numeric(j - 1) ? "right" : "left" };
    });
  }

  // Column widths from content, frozen header, filter on the table.
  cols.forEach((c, j) => {
    const lengths = [c.header, ...opts.rows.map((r) => r[j] ?? ""), opts.totals?.[j] ?? ""].map((v) => String(v).length);
    ws.getColumn(j + 1).width = Math.min(Math.max(...lengths, 8) + 2, 60);
  });
  ws.views = [{ state: "frozen", ySplit: headerRow }];
  if (opts.rows.length > 0) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastBodyRow, column: lastCol } };

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `${safeFileName(`${opts.title} ${opts.subtitle ?? ""}`)} ${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (isTauri()) {
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeFile(fileName, new Uint8Array(buffer as ArrayBuffer), { baseDir: BaseDirectory.Download });
    // No save dialog natively: say where the file went.
    const msg = "Excel file saved to your Downloads folder";
    toast(`${useLanguageStore.getState().language === "fr" ? FR[msg] ?? msg : msg}: ${fileName}`, "success");
    return;
  }
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One entry point for the report buttons: PDF opens the print dialog, Excel
 * downloads an .xlsx. */
export async function exportReport(opts: ReportOptions, format: ReportFormat): Promise<void> {
  if (format === "xlsx") await exportReportExcel(opts);
  else printColoredReport(opts);
}
