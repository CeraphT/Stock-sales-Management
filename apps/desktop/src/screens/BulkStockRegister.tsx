import { productsApi } from "@stockflow/core/api/endpoints/products";
import { parseRawText, resolveRows, type ParsedBulkStockRow } from "@stockflow/core/bulk/parseBulkStock";
import { db } from "@stockflow/core/db/client";
import { categories, products } from "@stockflow/core/db/schema";
import { eq } from "drizzle-orm";
import { useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { readFilledTemplate } from "@/lib/bulkUpload";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";

const EXAMPLE_ROW = "Paracetamol 500mg, 6009123456789, Pain Relief, 150, 250, 20, LOT-2026-01, 2027-06-30, 100";

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
 * which Excel renders with all the inline styling intact. Users type their rows
 * under the two examples, then copy just the data rows back into the paste box
 * (Excel copy is tab-separated, which the parser handles). Barcode/expiry cells
 * are forced to text so long codes don't turn into scientific notation. */
function buildTemplateWorkbook(): string {
  // Exact app palette (apps/desktop/src/index.css light theme).
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

const TEMPLATE_XLS = buildTemplateWorkbook();

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function BulkStockRegister() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const t = useT();

  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedBulkStockRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [processing, setProcessing] = useState(false);

  async function saveTemplate() {
    try {
      if (isTauri) {
        // The native WebView2 doesn't trigger blob downloads — write the file
        // straight to the OS Downloads folder via the fs plugin.
        const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        await writeTextFile("bulk-stock-template.xls", TEMPLATE_XLS, { baseDir: BaseDirectory.Download });
        toast(t("Template saved to your Downloads folder."), "success");
        return;
      }
      const blob = new Blob([TEMPLATE_XLS], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk-stock-template.xls";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast(t("Could not save the template."), "error");
    }
  }

  const validRows = (parsed ?? []).filter((r) => r.kind !== "error");
  const errorRows = (parsed ?? []).filter((r) => r.kind === "error");

  async function onParse(text?: string) {
    const src = (text ?? rawText).trim();
    if (!companyId || !src) return;
    setParsing(true);
    try {
      const [existingProducts, existingCategories] = await Promise.all([
        db.query.products.findMany({ where: eq(products.companyId, companyId) }),
        db.query.categories.findMany({ where: eq(categories.companyId, companyId) }),
      ]);
      setParsed(resolveRows(parseRawText(src), existingProducts, existingCategories));
    } finally {
      setParsing(false);
    }
  }

  // Upload a filled template file (.xlsx/.xls/.csv): parse it, fill blanks with
  // defaults, drop it into the box, and run the same check as pasting.
  async function onUpload(file: File | undefined) {
    if (!file) return;
    try {
      const text = await readFilledTemplate(file);
      if (!text.trim()) {
        toast(t("No product rows found in that file."), "error");
        return;
      }
      setRawText(text);
      await onParse(text);
    } catch {
      toast(t("Could not read that file."), "error");
    }
  }

  async function onRegister() {
    if (!companyId || !locationId || validRows.length === 0) return;
    setProcessing(true);
    let created = 0;
    let updated = 0;
    const failures: string[] = [];

    for (const row of validRows) {
      try {
        if (row.kind === "create") {
          const product = await productsApi.create(companyId, {
            name: row.productName,
            barcode: row.barcode,
            categoryId: row.categoryId,
            supplierId: null,
            purchasePrice: row.purchasePrice,
            salePrice: row.salePrice,
            lowStockThreshold: row.lowStockThreshold,
            taxRateOverridePercent: null,
            isFavorite: false,
            packagingLevels: null,
          });
          await productsApi.receiveStock(companyId, product.id, {
            locationId,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate ? `${row.expiryDate}T00:00:00.000Z` : null,
            quantityInBaseUnits: row.quantity,
            purchasePricePerBaseUnit: row.purchasePrice,
          });
          created++;
        } else if (row.kind === "update") {
          await productsApi.receiveStock(companyId, row.productId, {
            locationId,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate ? `${row.expiryDate}T00:00:00.000Z` : null,
            quantityInBaseUnits: row.quantity,
            purchasePricePerBaseUnit: row.purchasePricePerBaseUnit,
          });
          updated++;
        }
      } catch (err) {
        failures.push(`Line ${row.lineNumber} (${row.productName}): ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await runSync().catch(() => {});

    setProcessing(false);
    setParsed(null);
    setRawText("");
    toast(
      `✓ ${created} ${t("created")}, ${updated} ${t("restocked")}${failures.length ? ` · ${failures.length} ${t("failed")}` : ""}`,
      failures.length ? "error" : "success",
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">{t("Bulk stock registration")}</h2>
        <span className="w-12" />
      </div>

      <div className="space-y-2 rounded-card border border-border bg-surface p-5">
        <div className="text-sm font-bold text-text-primary">{t("How it works")}</div>
        <p className="text-xs text-text-secondary">
          {t("One product per line, no header row. Paste rows straight from Excel/Sheets or a CSV file. Columns, in order:")}
        </p>
        <p className="text-xs font-semibold text-text-primary">
          {t("Name, Barcode, Category, Purchase price, Sale price, Low-stock threshold, Batch number, Expiry (YYYY-MM-DD), Quantity")}
        </p>
        <p className="text-xs text-text-secondary">
          {t("Barcode matches an existing product first, then the exact name. For an existing product, prices/threshold can be left blank — its stock is just topped up. Example:")}
        </p>
        <p className="rounded-lg bg-background p-2 font-mono text-[11px] text-text-secondary">{EXAMPLE_ROW}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button onClick={saveTemplate} className="self-start rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20">
            ⬇ {t("Download Excel template")}
          </button>
          <label className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110">
            ⬆ {t("Upload filled file")}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => {
                void onUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-[11px] text-text-secondary">{t("Blank fields get sensible defaults (barcode, batch, qty 1).")}</span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">{t("Paste product rows")}</label>
        <textarea
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            setParsed(null);
          }}
          placeholder={EXAMPLE_ROW}
          rows={7}
          className="w-full rounded-xl border border-border bg-background p-3 font-mono text-sm text-text-primary outline-none focus:border-primary"
        />
      </div>

      <Button onClick={() => onParse()} loading={parsing} disabled={!rawText.trim()}>
        {t("Check rows")}
      </Button>

      {parsed ? (
        <div className="space-y-2">
          {/* Summary report + guidance on what to fix. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-bold text-text-primary">{t("Check summary")}</div>
            <div className="mt-1 text-sm text-text-secondary">
              ✅ <span className="font-semibold text-success">{validRows.length}</span> {t("ready")} —{" "}
              {validRows.filter((r) => r.kind === "create").length} {t("new")}, {validRows.filter((r) => r.kind === "update").length} {t("to restock")}
            </div>
            {errorRows.length > 0 ? (
              <div className="mt-1 text-sm font-medium text-error">
                ❌ {errorRows.length} {t("with errors")} — {t("fix the lines marked ❌ below, then Check rows again.")}
              </div>
            ) : (
              <div className="mt-1 text-sm font-medium text-success">✓ {t("All rows are valid — ready to register.")}</div>
            )}
          </div>
          {parsed.map((row) => (
            <div key={row.lineNumber} className="rounded-xl border border-border/60 bg-surface p-3">
              <div className="flex items-center gap-2">
                <span>{row.kind === "error" ? "❌" : row.kind === "create" ? "➕" : "🔄"}</span>
                <span className="flex-1 text-sm font-semibold text-text-primary">
                  {t("Line")} {row.lineNumber} · {row.productName}
                </span>
              </div>
              {row.kind === "error" ? <p className="mt-1 text-xs text-error">{row.message}</p> : null}
              {row.kind === "create" ? (
                <p className="mt-1 text-xs text-text-secondary">
                  {t("New product")} · {row.quantity} {t("units received")}
                  {row.categoryWarning ? ` · ${row.categoryWarning}` : ""}
                </p>
              ) : null}
              {row.kind === "update" ? (
                <p className="mt-1 text-xs text-text-secondary">
                  {t("Existing product")} · {row.quantity} {t("units added to stock")}
                </p>
              ) : null}
            </div>
          ))}

          <Button onClick={onRegister} loading={processing} disabled={validRows.length === 0}>
            {t("Register")} {validRows.length} {validRows.length === 1 ? t("item") : t("items")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
