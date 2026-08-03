import type { CompanyResponse } from "@stockflow/core/api/types/auth";
import type { SaleDetailResponse } from "@stockflow/core/api/types/sales";
import { generateReceiptHtml } from "@stockflow/core/receipt/generateReceiptHtml";
import type { ReceiptData } from "@stockflow/core/receipt/receiptTypes";

/** Maps a server sale + company into the shared receipt shape. */
export function saleToReceiptData(sale: SaleDetailResponse, company: Pick<CompanyResponse, "name" | "currency">): ReceiptData {
  return {
    saleId: sale.id,
    timestamp: sale.timestamp,
    companyName: company.name,
    locationName: sale.locationName,
    cashierName: sale.cashierName,
    currency: company.currency,
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
  };
}

/** Renders the receipt HTML into a hidden iframe and opens the OS print dialog
 * (which on desktop doubles as "Save as PDF"). Works in the Tauri webview and
 * a plain browser alike — no native code needed for the HTML path. */
export function printReceipt(sale: SaleDetailResponse, company: Pick<CompanyResponse, "name" | "currency">): void {
  const html = generateReceiptHtml(saleToReceiptData(sale, company));
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
