import { formatCurrency } from "@stockflow/core/format";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Prints a small gift-card voucher the cashier hands to the customer — the code
 * they bring back next visit to redeem at checkout (Gift card payment method).
 * Uses a hidden iframe + the OS print dialog (which doubles as "Save as PDF"),
 * the same mechanism as the sales receipt.
 */
export function printGiftCardVoucher(opts: { companyName: string; code: string; value: number; currency: string; customerName?: string }): void {
  const { companyName, code, value, currency, customerName } = opts;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gift card ${esc(code)}</title><style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:24px;display:flex;justify-content:center}
    .card{width:320px;border:2px dashed #4F46E5;border-radius:16px;padding:22px;text-align:center}
    .biz{font-size:13px;color:#666;margin-bottom:6px}
    .title{font-size:16px;font-weight:800;color:#4F46E5;margin-bottom:14px}
    .val{font-size:30px;font-weight:800;margin:6px 0}
    .code{font-family:ui-monospace,Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:2px;background:#F5F8F7;border-radius:10px;padding:10px;margin:14px 0}
    .note{font-size:11px;color:#666;margin-top:10px}
    @media print{body{margin:0}}</style></head><body>
    <div class="card">
      <div class="biz">${esc(companyName)}</div>
      <div class="title">🎁 Gift Card</div>
      ${customerName ? `<div class="biz">For ${esc(customerName)}</div>` : ""}
      <div class="val">${esc(formatCurrency(value, currency))}</div>
      <div class="code">${esc(code)}</div>
      <div class="note">Present this code at checkout to redeem. Non-refundable. Treat like cash.</div>
    </div></body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow!.focus();
  window.setTimeout(() => {
    iframe.contentWindow!.print();
    window.setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}
