import { PaymentMethod } from "../api/enums";
import { paymentMethodLabel } from "../format";
import type { ReceiptData, ReceiptLine } from "../receipt/receiptTypes";

import { encodeCp850 } from "./cp850";

// TS port of the MAUI client's ReceiptFormatter.cs — same ESC/POS command
// set, same 32-column (58mm/Font A) layout math, same CP850 codepage
// choice. Kept byte-for-byte equivalent so a printer tuned against one
// client behaves identically against the other.
const ESC = 0x1b;
const GS = 0x1d;
const LINE_WIDTH = 32;
const CODEPAGE_SELECTOR = 2; // ESC t n — "best effort", see cp850.ts

enum Align {
  Left = 0,
  Center = 1,
}

class ByteWriter {
  private bytes: number[] = [];

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  text(value: string): this {
    this.bytes.push(...encodeCp850(value));
    return this;
  }

  line(value: string): this {
    return this.text(value).raw(0x0a);
  }

  align(a: Align): this {
    return this.raw(ESC, 0x61, a);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  feed(lines: number): this {
    return this.raw(ESC, 0x64, lines);
  }

  separator(): this {
    return this.line("-".repeat(LINE_WIDTH));
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Naive character-count wrap (no whitespace awareness) — matches the
 * original's `Wrap`, which is correct enough for the common case and easy
 * to reason about against a fixed-width thermal font. */
function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}

/** Right-pads `label` and pushes `amount` flush against the right edge of
 * a `LINE_WIDTH`-column line, truncating the label (never the amount) if
 * both together would overflow. */
function justified(label: string, amount: string): string {
  const maxLabelWidth = Math.max(1, LINE_WIDTH - amount.length - 1);
  const trimmedLabel = label.length > maxLabelWidth ? label.slice(0, maxLabelWidth) : label;
  const padding = Math.max(1, LINE_WIDTH - trimmedLabel.length - amount.length);
  return trimmedLabel + " ".repeat(padding) + amount;
}

function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString();
}

function formatQuantityDetail(line: ReceiptLine): string {
  if (line.packagingLevelName) {
    const count = line.quantityInBaseUnits / line.unitsPerPackagingLevel;
    return `${count} ${line.packagingLevelName} × ${formatAmount(line.unitPrice * line.unitsPerPackagingLevel)}`;
  }
  return `${line.quantityInBaseUnits} unit${line.quantityInBaseUnits === 1 ? "" : "s"} × ${formatAmount(line.unitPrice)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Builds the exact ESC/POS byte sequence for a 32-column (58mm, Font A)
 * thermal receipt printer from the same `ReceiptData` the PDF/HTML
 * receipt uses — see generateReceiptHtml.ts for the parallel HTML build,
 * kept content-equivalent so the two never drift apart. */
export function buildEscPosReceipt(data: ReceiptData): Uint8Array {
  const w = new ByteWriter();

  w.raw(ESC, 0x40); // ESC @ — initialize
  w.raw(ESC, 0x74, CODEPAGE_SELECTOR); // ESC t n — select codepage

  w.align(Align.Center);
  w.bold(true);
  w.line(data.companyName);
  w.bold(false);
  if (data.locationName) w.line(data.locationName);
  w.line(formatTimestamp(data.timestamp));
  w.line(`Cashier: ${data.cashierName}`);
  w.separator();

  w.align(Align.Left);
  for (const line of data.productLines) {
    for (const chunk of wrap(line.productName, LINE_WIDTH)) w.line(chunk);
    w.line(justified(formatQuantityDetail(line), formatAmount(line.lineTotal)));
  }
  for (const line of data.serviceLines) {
    for (const chunk of wrap(line.serviceName, LINE_WIDTH)) w.line(chunk);
    w.line(justified(`${line.quantity} x ${formatAmount(line.unitPrice)}`, formatAmount(line.lineTotal)));
  }
  w.separator();

  w.bold(true);
  w.line(justified("TOTAL", `${formatAmount(data.total)} ${data.currency}`));
  w.bold(false);

  if (data.paymentSplits.length > 0) {
    for (const split of data.paymentSplits) {
      w.line(justified(paymentMethodLabel(split.method), formatAmount(split.amount)));
    }
  } else {
    w.line(paymentMethodLabel(data.paymentMethod));
  }

  if (data.paymentMethod === PaymentMethod.Cash && data.amountTendered != null) {
    w.line(justified("Tendered", formatAmount(data.amountTendered)));
    w.line(justified("Change", formatAmount(data.changeDue ?? 0)));
  }

  w.separator();
  w.align(Align.Center);
  w.line("Thank you for your business!");
  w.line("Powered by StockFlow");
  w.feed(4);
  w.raw(GS, 0x56, 1); // GS V 1 — partial cut (ignored by printers with no cutter)

  return w.toBytes();
}

/** A short synthetic receipt for the printer settings screen's "print
 * test page" action — independent of any real sale. */
export function buildEscPosTestPage(companyName: string, currency: string): Uint8Array {
  const now = new Date().toISOString();
  return buildEscPosReceipt({
    saleId: "test",
    timestamp: now,
    companyName,
    locationName: "Print test",
    cashierName: "—",
    currency,
    paymentMethod: PaymentMethod.Cash,
    productLines: [
      {
        productName: "Test item",
        quantityInBaseUnits: 1,
        packagingLevelName: null,
        unitsPerPackagingLevel: 1,
        unitPrice: 100,
        lineTotal: 100,
      },
    ],
    serviceLines: [],
    paymentSplits: [],
    amountTendered: 100,
    changeDue: 0,
    total: 100,
  });
}
