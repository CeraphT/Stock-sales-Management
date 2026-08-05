import { PaymentMethod } from "./api/enums";
import type { ShiftDetailResponse } from "./api/types/shifts";
import { formatCurrency } from "./format";

export interface DailyCashRow {
  date: string; // YYYY-MM-DD
  cash: number;
  mobile: number;
  total: number;
  shifts: number;
}

function methodTotal(shift: ShiftDetailResponse, method: PaymentMethod): number {
  return shift.paymentBreakdown.find((b) => b.method === method)?.total ?? 0;
}

/** Aggregate closed shifts into one row per day (cash, mobile money, total),
 * newest first — the "trace every day's takings" report. */
export function buildDailyRows(shifts: ShiftDetailResponse[]): DailyCashRow[] {
  const byDay = new Map<string, DailyCashRow>();
  for (const s of shifts) {
    const date = s.openedAt.slice(0, 10);
    const row = byDay.get(date) ?? { date, cash: 0, mobile: 0, total: 0, shifts: 0 };
    row.cash += methodTotal(s, PaymentMethod.Cash);
    row.mobile += methodTotal(s, PaymentMethod.MobileMoney);
    row.total += s.totalSales;
    row.shifts += 1;
    byDay.set(date, row);
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Pure HTML for the daily cash report — shared by desktop (rendered in a hidden
 * iframe + window.print) and mobile (expo-print). No DOM/native API here. */
export function generateCashReportHtml(
  rows: DailyCashRow[],
  companyName: string,
  currency: string,
  from: string,
  to: string,
): string {
  const totCash = rows.reduce((s, r) => s + r.cash, 0);
  const totMobile = rows.reduce((s, r) => s + r.mobile, 0);
  const totAll = rows.reduce((s, r) => s + r.total, 0);
  const range = from || to ? `${from || "…"} → ${to || "…"}` : "All time";

  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.date}</td>
        <td class="r">${esc(formatCurrency(r.cash, currency))}</td>
        <td class="r">${esc(formatCurrency(r.mobile, currency))}</td>
        <td class="r b">${esc(formatCurrency(r.total, currency))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Cash report</title>
    <style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px;}
      h1{font-size:18px;margin:0 0 2px;} .sub{color:#666;font-size:12px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;}
      th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#666;}
      td.r,th.r{text-align:right;} td.b{font-weight:700;}
      tfoot td{border-top:2px solid #111;font-weight:700;}
      @media print{body{margin:0;}}
    </style></head><body>
    <h1>${esc(companyName)} — Cash report</h1>
    <div class="sub">${esc(range)} · Cash counted in the drawer vs. mobile money (electronic)</div>
    <table>
      <thead><tr><th>Day</th><th class="r">💵 Cash</th><th class="r">📱 Mobile money</th><th class="r">Total sales</th></tr></thead>
      <tbody>${body || `<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">No shifts in this range.</td></tr>`}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${esc(formatCurrency(totCash, currency))}</td><td class="r">${esc(formatCurrency(totMobile, currency))}</td><td class="r">${esc(formatCurrency(totAll, currency))}</td></tr></tfoot>
    </table>
    </body></html>`;
}
