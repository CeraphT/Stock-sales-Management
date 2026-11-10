import { formatCurrency } from "../format";
import { docLocale, dt } from "../i18n/docText";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SalesListRow {
  timestamp: string;
  primaryLabel: string;
  secondaryLabel: string;
  total: number;
}

export interface SalesListData {
  companyName: string;
  currency: string;
  title: string;
  subtitle: string;
  primaryColumnLabel: string;
  secondaryColumnLabel: string;
  rows: SalesListRow[];
}

/** Generic tabular list export (Sales History, Held Sales) — same visual
 * language as generateReportHtml.ts so every PDF the app produces reads as
 * one consistent family of documents. */
export function generateListHtml(data: SalesListData): string {
  const generatedAt = new Date().toLocaleString(docLocale(), { dateStyle: "medium", timeStyle: "short" });
  const total = data.rows.reduce((sum, r) => sum + r.total, 0);

  const rows = data.rows
    .map(
      (r) => `
        <tr>
          <td>${new Date(r.timestamp).toLocaleString(docLocale(), { dateStyle: "short", timeStyle: "short" })}</td>
          <td>${escapeHtml(r.primaryLabel)}</td>
          <td>${escapeHtml(r.secondaryLabel)}</td>
          <td class="num">${formatCurrency(r.total, data.currency)}</td>
        </tr>`,
    )
    .join("");

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
  .report-title { font-size: 13px; color: #6B7280; margin: 4px 0 0; }
  .meta { text-align: right; font-size: 11px; color: #6B7280; }
  .meta strong { color: #1F2937; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6B7280; padding: 6px 8px; border-bottom: 1px solid #E3E7E5; }
  thead th.num, td.num { text-align: right; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; }
  tbody tr:nth-child(even) { background: #FAFBFA; }
  tfoot td { padding: 8px; font-weight: 700; color: #0F766E; border-top: 2px solid #0F766E; }
  .empty { font-size: 12px; color: #9CA3AF; padding: 10px 0; }
  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #E3E7E5; text-align: center; font-size: 10px; color: #9CA3AF; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="company-name">${escapeHtml(data.companyName)}</p>
      <p class="report-title">${escapeHtml(data.title)} · ${escapeHtml(data.subtitle)}</p>
    </div>
    <div class="meta">${dt("doc.generated")} <strong>${generatedAt}</strong></div>
  </div>

  ${
    rows
      ? `<table>
    <thead><tr><th>${dt("doc.date")}</th><th>${escapeHtml(data.primaryColumnLabel)}</th><th>${escapeHtml(data.secondaryColumnLabel)}</th><th class="num">${dt("doc.total")}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">${dt("doc.totalCount", { n: data.rows.length })}</td><td class="num">${formatCurrency(total, data.currency)}</td></tr></tfoot>
  </table>`
      : `<p class="empty">${dt("doc.nothing")}</p>`
  }

  <div class="footer">${dt("doc.poweredBy")}</div>
</body>
</html>`;
}
