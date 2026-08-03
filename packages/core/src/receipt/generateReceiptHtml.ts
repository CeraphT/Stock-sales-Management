import { PaymentMethod } from "../api/enums";
import { formatCurrency, paymentMethodLabel } from "../format";

import type { ReceiptData } from "./receiptTypes";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatLineQuantity(line: ReceiptData["productLines"][number]): string {
  if (line.packagingLevelName) {
    const count = line.quantityInBaseUnits / line.unitsPerPackagingLevel;
    return `${count} × ${escapeHtml(line.packagingLevelName)}`;
  }
  return `${line.quantityInBaseUnits} unit${line.quantityInBaseUnits === 1 ? "" : "s"}`;
}

/** Renders a printable/PDF-able receipt as self-contained HTML — passed to
 * expo-print, which turns it into an actual PDF (via `printAsync` for a
 * live preview with a built-in "Save as PDF" option, or
 * `printToFileAsync` to get a file straight away for sharing). */
export function generateReceiptHtml(data: ReceiptData): string {
  const rows =
    data.productLines
      .map(
        (line) => `
        <tr>
          <td class="item-name">${escapeHtml(line.productName)}</td>
          <td class="item-qty">${formatLineQuantity(line)}</td>
          <td class="item-price">${formatCurrency(line.unitPrice, data.currency)}</td>
          <td class="item-total">${formatCurrency(line.lineTotal, data.currency)}</td>
        </tr>`,
      )
      .join("") +
    data.serviceLines
      .map(
        (line) => `
        <tr>
          <td class="item-name">${escapeHtml(line.serviceName)}</td>
          <td class="item-qty">${line.quantity}</td>
          <td class="item-price">${formatCurrency(line.unitPrice, data.currency)}</td>
          <td class="item-total">${formatCurrency(line.lineTotal, data.currency)}</td>
        </tr>`,
      )
      .join("");

  const paymentRows =
    data.paymentSplits.length > 0
      ? data.paymentSplits
          .map(
            (split) => `
        <div class="payment-row">
          <span>${paymentMethodLabel(split.method)}</span>
          <span>${formatCurrency(split.amount, data.currency)}</span>
        </div>`,
          )
          .join("")
      : `
        <div class="payment-row">
          <span>${paymentMethodLabel(data.paymentMethod)}</span>
          <span>${formatCurrency(data.total, data.currency)}</span>
        </div>`;

  const tenderedBlock =
    data.paymentMethod === PaymentMethod.Cash && data.amountTendered != null
      ? `
        <div class="payment-row muted">
          <span>Tendered</span>
          <span>${formatCurrency(data.amountTendered, data.currency)}</span>
        </div>
        <div class="payment-row muted">
          <span>Change</span>
          <span>${formatCurrency(data.changeDue ?? 0, data.currency)}</span>
        </div>`
      : "";

  const timestamp = new Date(data.timestamp);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, Helvetica, Arial, sans-serif;
    color: #1F2937;
    background: #FFFFFF;
    margin: 0;
    padding: 32px 24px;
  }
  .receipt {
    max-width: 380px;
    margin: 0 auto;
  }
  .header {
    text-align: center;
    margin-bottom: 20px;
  }
  .company-name {
    font-size: 22px;
    font-weight: 700;
    color: #4F46E5;
    margin: 0;
  }
  .location-name {
    font-size: 13px;
    color: #6B7280;
    margin: 4px 0 0;
  }
  .divider {
    border-top: 1px dashed #D1D5DB;
    margin: 16px 0;
  }
  .meta {
    font-size: 12px;
    color: #6B7280;
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 13px;
  }
  thead th {
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #6B7280;
    border-bottom: 1px solid #E3E7E5;
    padding: 0 0 6px;
  }
  thead th.item-qty, thead th.item-price, thead th.item-total { text-align: right; }
  tbody td {
    padding: 8px 0;
    border-bottom: 1px solid #F3F4F6;
    vertical-align: top;
  }
  .item-name { font-weight: 600; }
  .item-qty, .item-price, .item-total { text-align: right; color: #4B5563; white-space: nowrap; }
  .item-total { color: #1F2937; font-weight: 600; }
  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 16px;
  }
  .total-label { font-size: 14px; color: #6B7280; }
  .total-value { font-size: 24px; font-weight: 700; color: #4F46E5; }
  .payment-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 3px 0;
  }
  .payment-row.muted { color: #6B7280; }
  .footer {
    text-align: center;
    margin-top: 24px;
    font-size: 12px;
    color: #6B7280;
  }
  .footer .thanks {
    font-size: 14px;
    font-weight: 600;
    color: #1F2937;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <p class="company-name">${escapeHtml(data.companyName)}</p>
      <p class="location-name">${escapeHtml(data.locationName)}</p>
    </div>

    <div class="divider"></div>

    <div class="meta"><span>Receipt</span><span>#${data.saleId.slice(0, 8).toUpperCase()}</span></div>
    <div class="meta"><span>Date</span><span>${timestamp.toLocaleString()}</span></div>
    <div class="meta"><span>Cashier</span><span>${escapeHtml(data.cashierName)}</span></div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="item-qty">Qty</th>
          <th class="item-price">Price</th>
          <th class="item-total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="total-row">
      <span class="total-label">Total</span>
      <span class="total-value">${formatCurrency(data.total, data.currency)}</span>
    </div>

    <div class="divider"></div>

    ${paymentRows}
    ${tenderedBlock}

    <div class="footer">
      <p class="thanks">Thank you for your business!</p>
      <p>Powered by StockFlow</p>
    </div>
  </div>
</body>
</html>`;
}
