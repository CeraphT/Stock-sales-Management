import { buildDailyRows, generateCashReportHtml, type DailyCashRow } from "@stockflow/core/cashReport";

// buildDailyRows + DailyCashRow now live in @stockflow/core (shared with mobile);
// re-export so existing desktop imports from "@/lib/cashReport" keep working.
export { buildDailyRows };
export type { DailyCashRow };

/** Render the daily cash report to a hidden iframe and open the print/Save-as-PDF
 * dialog (same approach as the receipt printer — no native code). */
export function printCashReport(rows: DailyCashRow[], companyName: string, currency: string, from: string, to: string): void {
  const html = generateCashReportHtml(rows, companyName, currency, from, to);

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
