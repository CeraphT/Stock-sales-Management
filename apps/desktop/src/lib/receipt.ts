import type { CompanyResponse } from "@stockflow/core/api/types/auth";
import type { SaleDetailResponse } from "@stockflow/core/api/types/sales";
import { buildEscPosReceipt, buildEscPosTestPage } from "@stockflow/core/printer/escpos";
import { generateReceiptHtml } from "@stockflow/core/receipt/generateReceiptHtml";
import type { ReceiptData } from "@stockflow/core/receipt/receiptTypes";

import { receiptWidthPx, transportKind, usePrefsStore } from "@/lib/prefs";
import { isTauri, printBytes } from "@/lib/thermalPrinter";
import { toast } from "@/lib/toast";

/** Reads the current thermal config; returns null unless a native thermal
 * printer is enabled and configured. */
function thermalConfig() {
  const p = usePrefsStore.getState();
  if (!p.thermalEnabled || !isTauri() || !p.thermalTarget.trim()) return null;
  return { kind: transportKind(p.thermalConnection), target: p.thermalTarget.trim(), baud: p.thermalBaud };
}

type ReceiptCompany = Pick<CompanyResponse, "name" | "currency"> &
  Partial<Pick<CompanyResponse, "logoUrl" | "address" | "phone" | "receiptFooter">>;

/** Maps a server sale + company into the shared receipt shape. */
export function saleToReceiptData(sale: SaleDetailResponse, company: ReceiptCompany): ReceiptData {
  return {
    saleId: sale.id,
    timestamp: sale.timestamp,
    companyName: company.name,
    locationName: sale.locationName,
    cashierName: sale.cashierName,
    currency: company.currency,
    logoUrl: company.logoUrl ?? null,
    address: company.address ?? null,
    phone: company.phone ?? null,
    footer: company.receiptFooter ?? null,
    paymentMethod: sale.paymentMethod,
    productLines: sale.productLines.map((l) => ({
      productName: l.productName,
      quantityInBaseUnits: l.quantityInBaseUnits,
      packagingLevelName: l.packagingLevelName,
      unitsPerPackagingLevel: l.unitsPerPackagingLevel,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    serviceLines: sale.serviceLines.map((l) => ({
      serviceName: l.serviceName,
      quantity: l.quantity,
      unitPrice: l.billedPrice,
      lineTotal: l.lineTotal,
    })),
    paymentSplits: sale.paymentSplits.map((s) => ({ method: s.method, amount: s.amount })),
    amountTendered: sale.amountTendered,
    changeDue: sale.changeDue,
    total: sale.total,
    // VAT per line: B2B adds it on top (rate/100), B2C extracts it from the
    // inclusive price (rate/(100+rate)). Either way, net = total − VAT.
    taxTotal: sale.productLines.reduce((s, l) => {
      if (l.taxRatePercent <= 0) return s;
      return s + (sale.taxAddedOnTop ? (l.lineTotal * l.taxRatePercent) / 100 : (l.lineTotal * l.taxRatePercent) / (100 + l.taxRatePercent));
    }, 0),
    customerTaxId: sale.customerTaxId,
    invoiceNumber: sale.invoiceNumber,
    sellerTaxId: sale.sellerTaxId,
    paperWidthPx: receiptWidthPx(usePrefsStore.getState().receiptWidth),
  };
}

/** Renders the receipt HTML into a hidden iframe and opens the OS print dialog
 * (which on desktop doubles as "Save as PDF"). Works in the Tauri webview and
 * a plain browser alike — no native code needed for the HTML path. */
function printHtmlDocument(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow!;
  win.focus();
  window.setTimeout(() => {
    win.print();
    window.setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}

/** Prints many receipts as a single document — one receipt per page (page
 * breaks) — so a filtered batch can be saved to one PDF or printed in one go.
 * Reuses each receipt's own HTML: shared styles once + each body on its page. */
export function printReceiptsBatch(sales: SaleDetailResponse[], company: ReceiptCompany): void {
  if (sales.length === 0) return;
  const htmls = sales.map((s) => generateReceiptHtml(saleToReceiptData(s, company)));
  const style = htmls[0].match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
  const bodies = htmls
    .map((h, i) => {
      const inner = h.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? h;
      const brk = i < htmls.length - 1 ? "page-break-after:always;" : "";
      return `<div style="${brk}">${inner}</div>`;
    })
    .join("");
  printHtmlDocument(`<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${bodies}</body></html>`);
}

/** Prints a sample receipt so the cashier can check paper width / alignment
 * without ringing up a real sale. Respects the current printer preferences. */
export function printTestReceipt(company: ReceiptCompany, sellerTaxId?: string | null): void {
  const thermal = thermalConfig();
  if (thermal) {
    const bytes = buildEscPosTestPage(company.name, company.currency);
    printBytes(bytes, thermal).catch((e) => toast(e instanceof Error ? e.message : "Thermal print failed.", "error"));
    return;
  }
  const data: ReceiptData = {
    saleId: "TESTPRNT",
    timestamp: new Date().toISOString(),
    companyName: company.name,
    locationName: "Main",
    cashierName: "—",
    currency: company.currency,
    logoUrl: company.logoUrl ?? null,
    address: company.address ?? null,
    phone: company.phone ?? null,
    footer: company.receiptFooter ?? null,
    sellerTaxId: sellerTaxId ?? null,
    paymentMethod: 0,
    productLines: [
      { productName: "Test item A", quantityInBaseUnits: 2, packagingLevelName: null, unitsPerPackagingLevel: 1, unitPrice: 500, lineTotal: 1000 },
      { productName: "Test item B", quantityInBaseUnits: 1, packagingLevelName: null, unitsPerPackagingLevel: 1, unitPrice: 1500, lineTotal: 1500 },
    ],
    serviceLines: [],
    paymentSplits: [],
    amountTendered: 3000,
    changeDue: 500,
    total: 2500,
    paperWidthPx: receiptWidthPx(usePrefsStore.getState().receiptWidth),
  };
  printHtmlDocument(generateReceiptHtml(data));
}

export function printReceipt(sale: SaleDetailResponse, company: ReceiptCompany): void {
  const data = saleToReceiptData(sale, company);
  const copies = Math.max(1, Math.min(5, usePrefsStore.getState().receiptCopies || 1));

  // Native thermal path: raw ESC/POS straight to the printer, no dialog.
  const thermal = thermalConfig();
  if (thermal) {
    const bytes = buildEscPosReceipt(data);
    (async () => {
      for (let i = 0; i < copies; i++) await printBytes(bytes, thermal);
    })().catch((e) => {
      // Fall back to the print dialog so a sale is never left without a receipt.
      toast(e instanceof Error ? e.message : "Thermal print failed — using the dialog.", "error");
      printHtmlDocument(generateReceiptHtml(data));
    });
    return;
  }

  const html = generateReceiptHtml(data);
  if (copies === 1) {
    printHtmlDocument(html);
    return;
  }
  // Multiple copies → one document, each copy on its own page.
  const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? html;
  const repeated = Array.from({ length: copies }, (_, i) => `<div style="${i < copies - 1 ? "page-break-after:always;" : ""}">${body}</div>`).join("");
  printHtmlDocument(`<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${repeated}</body></html>`);
}
