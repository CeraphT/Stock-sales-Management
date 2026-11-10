import { PurchaseOrderStatus } from "../api/enums";
import { formatCurrency, purchaseOrderStatusLabelKey } from "../format";
import { docLocale, dt } from "../i18n/docText";

import type { PurchaseOrderPdfData } from "./purchaseOrderPdfTypes";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.Pending]: "#D97706",
  [PurchaseOrderStatus.PartiallyReceived]: "#2563EB",
  [PurchaseOrderStatus.Received]: "#059669",
  [PurchaseOrderStatus.Cancelled]: "#6B7280",
};

/** Renders a purchase order as self-contained HTML — same visual family as
 * the sales report/receipt templates, turned into a real PDF by expo-print.
 * A supplier-facing document, so it always shows both ordered and received
 * quantities per line, whatever the order's current status is. */
export function generatePurchaseOrderHtml(data: PurchaseOrderPdfData): string {
  const generatedAt = new Date().toLocaleString(docLocale(), { dateStyle: "medium", timeStyle: "short" });
  const createdAt = new Date(data.createdAt).toLocaleDateString(docLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const statusColor = STATUS_COLOR[data.status];

  const rows = data.lines
    .map((line) => {
      const lineTotal = line.quantityOrdered * line.unitCost;
      return `
        <tr>
          <td>${escapeHtml(line.productName)}</td>
          <td class="num">${line.quantityOrdered}</td>
          <td class="num">${line.quantityReceived}</td>
          <td class="num">${formatCurrency(line.unitCost, data.currency)}</td>
          <td class="num">${formatCurrency(lineTotal, data.currency)}</td>
        </tr>`;
    })
    .join("");
  const total = data.lines.reduce((sum, l) => sum + l.quantityOrdered * l.unitCost, 0);
  const totalOrdered = data.lines.reduce((sum, l) => sum + l.quantityOrdered, 0);
  const totalReceived = data.lines.reduce((sum, l) => sum + l.quantityReceived, 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1F2937; background: #FFFFFF; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #0F766E; margin-bottom: 20px; }
  .company-name { font-size: 22px; font-weight: 700; color: #0F766E; margin: 0; }
  .doc-title { font-size: 13px; color: #6B7280; margin: 4px 0 0; }
  .meta { text-align: right; font-size: 11px; color: #6B7280; }
  .meta strong { color: #1F2937; }
  .status-badge {
    display: inline-block;
    margin-top: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: #FFFFFF;
    background: ${statusColor};
  }
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .info-card { background: #F5F8F7; border-radius: 10px; padding: 10px 14px; }
  .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; margin: 0 0 4px; }
  .info-value { font-size: 13px; font-weight: 600; color: #1F2937; margin: 0; }
  .notes { font-size: 12px; color: #4B5563; background: #FAFBFA; border-radius: 8px; padding: 10px 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6B7280; padding: 6px 8px; border-bottom: 1px solid #E3E7E5; }
  thead th.num, td.num { text-align: right; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; }
  tbody tr:nth-child(even) { background: #FAFBFA; }
  tfoot td { padding: 8px; font-weight: 700; color: #0F766E; border-top: 2px solid #0F766E; }
  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #E3E7E5; text-align: center; font-size: 10px; color: #9CA3AF; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="company-name">${escapeHtml(data.companyName)}</p>
      <p class="doc-title">${dt("doc.purchaseOrder")} · #${data.id.slice(0, 8).toUpperCase()}</p>
      <span class="status-badge">${dt(purchaseOrderStatusLabelKey(data.status))}</span>
    </div>
    <div class="meta">${dt("doc.generated")} <strong>${generatedAt}</strong></div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <p class="info-label">${dt("doc.supplier")}</p>
      <p class="info-value">${escapeHtml(data.supplierName)}</p>
    </div>
    <div class="info-card">
      <p class="info-label">${dt("doc.location")}</p>
      <p class="info-value">${escapeHtml(data.locationName)}</p>
    </div>
    <div class="info-card">
      <p class="info-label">${dt("doc.orderDate")}</p>
      <p class="info-value">${createdAt}</p>
    </div>
  </div>

  ${data.notes ? `<div class="notes"><strong>${dt("doc.notes")} :</strong> ${escapeHtml(data.notes)}</div>` : ""}

  ${
    rows
      ? `<table>
    <thead><tr><th>${dt("doc.product")}</th><th class="num">${dt("doc.ordered")}</th><th class="num">${dt("doc.received")}</th><th class="num">${dt("doc.unitCost")}</th><th class="num">${dt("doc.lineTotal")}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>${data.lines.length === 1 ? dt("doc.linesTotal1") : dt("doc.linesTotal", { n: data.lines.length })}</td><td class="num">${totalOrdered}</td><td class="num">${totalReceived}</td><td></td><td class="num">${formatCurrency(total, data.currency)}</td></tr></tfoot>
  </table>`
      : `<p>${dt("doc.noLines")}</p>`
  }

  <div class="footer">${dt("doc.poweredBy")}</div>
</body>
</html>`;
}
