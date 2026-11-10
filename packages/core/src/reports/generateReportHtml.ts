import { formatCurrency } from "../format";
import { docLocale, dt } from "../i18n/docText";

import type { ReportData } from "./reportTypes";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(docLocale(), { year: "numeric", month: "short", day: "numeric" });
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(docLocale(), { weekday: "short", month: "short", day: "numeric" });
}

/** Renders the sales report (summary + daily breakdown + top products) as
 * self-contained HTML, turned into a real PDF by expo-print — same
 * approach as the receipt template, aimed at the same bar: something an
 * owner would actually want to open, not just a data dump. */
export function generateReportHtml(data: ReportData): string {
  const { summary, topProducts, currency } = data;
  const margin = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
  const generatedAt = new Date().toLocaleString(docLocale(), { dateStyle: "medium", timeStyle: "short" });

  const dailyRows = [...summary.dailyBreakdown]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (d) => `
        <tr>
          <td>${formatDayLabel(d.date)}</td>
          <td class="num">${d.salesCount}</td>
          <td class="num">${formatCurrency(d.revenue, currency)}</td>
        </tr>`,
    )
    .join("");
  const dailyTotalSales = summary.dailyBreakdown.reduce((sum, d) => sum + d.salesCount, 0);
  const dailyTotalRevenue = summary.dailyBreakdown.reduce((sum, d) => sum + d.revenue, 0);

  const topProductRows = topProducts
    .map(
      (p, i) => `
        <tr>
          <td class="num muted">${i + 1}</td>
          <td>${escapeHtml(p.productName)}</td>
          <td class="num">${p.quantitySold}</td>
          <td class="num">${formatCurrency(p.revenue, currency)}</td>
          <td class="num">${formatCurrency(p.profit, currency)}</td>
        </tr>`,
    )
    .join("");
  const topProductsTotalQty = topProducts.reduce((sum, p) => sum + p.quantitySold, 0);
  const topProductsTotalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0);
  const topProductsTotalProfit = topProducts.reduce((sum, p) => sum + p.profit, 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, Helvetica, Arial, sans-serif;
    color: #1F2937;
    background: #FFFFFF;
    margin: 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 2px solid #0F766E;
    margin-bottom: 20px;
  }
  .company-name { font-size: 22px; font-weight: 700; color: #0F766E; margin: 0; }
  .report-title { font-size: 13px; color: #6B7280; margin: 4px 0 0; }
  .meta { text-align: right; font-size: 11px; color: #6B7280; }
  .meta strong { color: #1F2937; }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }
  .summary-card {
    background: #F5F8F7;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; margin: 0 0 4px; }
  .summary-value { font-size: 17px; font-weight: 700; color: #1F2937; margin: 0; }
  .summary-value.accent { color: #0F766E; }
  section { margin-bottom: 22px; }
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #1F2937;
    border-bottom: 1px solid #E3E7E5;
    padding-bottom: 6px;
    margin: 0 0 8px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6B7280;
    padding: 6px 8px;
    border-bottom: 1px solid #E3E7E5;
  }
  thead th.num, td.num { text-align: right; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; }
  tbody tr:nth-child(even) { background: #FAFBFA; }
  td.muted { color: #9CA3AF; }
  tfoot td {
    padding: 8px;
    font-weight: 700;
    color: #1F2937;
    border-top: 2px solid #0F766E;
  }
  tfoot td.accent { color: #0F766E; }
  .empty { font-size: 12px; color: #9CA3AF; padding: 10px 0; }
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #E3E7E5;
    text-align: center;
    font-size: 10px;
    color: #9CA3AF;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="company-name">${escapeHtml(data.companyName)}</p>
      <p class="report-title">${dt("doc.salesReport")} · ${formatDate(data.from)} – ${formatDate(data.to)}</p>
    </div>
    <div class="meta">
      ${dt("doc.generated")} <strong>${generatedAt}</strong>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <p class="summary-label">${dt("doc.totalRevenue")}</p>
      <p class="summary-value accent">${formatCurrency(summary.totalRevenue, currency)}</p>
    </div>
    <div class="summary-card">
      <p class="summary-label">${dt("doc.totalCost")}</p>
      <p class="summary-value">${formatCurrency(summary.totalCost, currency)}</p>
    </div>
    <div class="summary-card">
      <p class="summary-label">${dt("doc.totalProfit")}</p>
      <p class="summary-value accent">${formatCurrency(summary.totalProfit, currency)}</p>
    </div>
    <div class="summary-card">
      <p class="summary-label">${dt("doc.margin")}</p>
      <p class="summary-value">${margin.toFixed(1)}%</p>
    </div>
    <div class="summary-card">
      <p class="summary-label">${dt("doc.salesCount")}</p>
      <p class="summary-value">${summary.totalSalesCount}</p>
    </div>
    <div class="summary-card">
      <p class="summary-label">${dt("doc.averageSale")}</p>
      <p class="summary-value">${formatCurrency(summary.averageSaleValue, currency)}</p>
    </div>
  </div>

  <section>
    <h2>${dt("doc.daily")}</h2>
    ${
      dailyRows
        ? `<table>
      <thead><tr><th>${dt("doc.date")}</th><th class="num">${dt("doc.sales")}</th><th class="num">${dt("doc.revenue")}</th></tr></thead>
      <tbody>${dailyRows}</tbody>
      <tfoot><tr><td>${dt("doc.total")}</td><td class="num">${dailyTotalSales}</td><td class="num accent">${formatCurrency(dailyTotalRevenue, currency)}</td></tr></tfoot>
    </table>`
        : `<p class="empty">${dt("doc.noSales")}</p>`
    }
  </section>

  <section>
    <h2>${dt("doc.topProducts")}</h2>
    ${
      topProductRows
        ? `<table>
      <thead><tr><th class="num">#</th><th>${dt("doc.product")}</th><th class="num">${dt("doc.qtySold")}</th><th class="num">${dt("doc.revenue")}</th><th class="num">${dt("doc.profit")}</th></tr></thead>
      <tbody>${topProductRows}</tbody>
      <tfoot><tr><td colspan="2">${dt("doc.topTotal", { n: topProducts.length })}</td><td class="num">${topProductsTotalQty}</td><td class="num accent">${formatCurrency(topProductsTotalRevenue, currency)}</td><td class="num accent">${formatCurrency(topProductsTotalProfit, currency)}</td></tr></tfoot>
    </table>`
        : `<p class="empty">${dt("doc.noProductSales")}</p>`
    }
  </section>

  <div class="footer">${dt("doc.poweredBy")}</div>
</body>
</html>`;
}
