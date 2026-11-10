import { docLocale } from "./i18n/docText";
import { PaymentMethod, PurchaseOrderStatus } from "./api/enums";
import type { TranslationKey } from "./i18n/translations";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.Cash]: "Cash",
  [PaymentMethod.MobileMoney]: "Mobile Money",
  [PaymentMethod.Credit]: "Credit",
  [PaymentMethod.StoreCredit]: "Store credit",
  [PaymentMethod.GiftCard]: "Gift card",
  [PaymentMethod.Split]: "Split",
};

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? "Unknown";
}

const PAYMENT_METHOD_LABEL_KEYS: Record<PaymentMethod, TranslationKey> = {
  [PaymentMethod.Cash]: "paymentMethod.cash",
  [PaymentMethod.MobileMoney]: "paymentMethod.mobileMoney",
  [PaymentMethod.Credit]: "paymentMethod.credit",
  [PaymentMethod.StoreCredit]: "paymentMethod.storeCredit",
  [PaymentMethod.GiftCard]: "paymentMethod.giftCard",
  [PaymentMethod.Split]: "paymentMethod.split",
};

/** Translation key for a payment method, for translated UIs: `t(paymentMethodLabelKey(m))`.
 * `paymentMethodLabel` stays English for receipts/PDFs and the web/desktop apps. */
export function paymentMethodLabelKey(method: PaymentMethod): TranslationKey {
  return PAYMENT_METHOD_LABEL_KEYS[method] ?? "common.unknown";
}

const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.Pending]: "Pending",
  [PurchaseOrderStatus.PartiallyReceived]: "Partially received",
  [PurchaseOrderStatus.Received]: "Received",
  [PurchaseOrderStatus.Cancelled]: "Cancelled",
};

export function purchaseOrderStatusLabel(status: PurchaseOrderStatus): string {
  return PURCHASE_ORDER_STATUS_LABELS[status] ?? "Unknown";
}

const PURCHASE_ORDER_STATUS_LABEL_KEYS: Record<PurchaseOrderStatus, TranslationKey> = {
  [PurchaseOrderStatus.Pending]: "poStatus.pending",
  [PurchaseOrderStatus.PartiallyReceived]: "poStatus.partiallyReceived",
  [PurchaseOrderStatus.Received]: "poStatus.received",
  [PurchaseOrderStatus.Cancelled]: "poStatus.cancelled",
};

/** Translation key for a purchase-order status: `t(purchaseOrderStatusLabelKey(s))`. */
export function purchaseOrderStatusLabelKey(status: PurchaseOrderStatus): TranslationKey {
  return PURCHASE_ORDER_STATUS_LABEL_KEYS[status] ?? "common.unknown";
}

/** `1234.5` + "XAF" -> "1,235 XAF". Deliberately not Intl.NumberFormat's
 * `currency` style — that requires a real ISO-4217 code and a fixed set of
 * symbol/decimal rules per currency, neither of which this project can
 * guarantee (a company's `currency` field is free text). Plain grouped
 * number + suffix works for any value and matches how amounts were shown
 * throughout the MAUI client and the seed data ("8,600 XAF"). */
export function formatCurrency(amount: number, currency: string): string {
  // CFA francs (and other currencies without cents) never show decimals: a
  // computed amount such as VAT (28 850 x 19.25 / 119.25 = 4 657.128) would
  // otherwise print as "4,657.128 XAF". Others keep at most 2 decimals.
  const digits = ZERO_DECIMAL_CURRENCIES.has(currency.trim().toUpperCase()) ? 0 : 2;
  return `${amount.toLocaleString(docLocale(), { maximumFractionDigits: digits })} ${currency}`;
}

const ZERO_DECIMAL_CURRENCIES = new Set(["XAF", "XOF", "FCFA", "CFA", "GNF", "RWF", "BIF", "KMF", "DJF", "UGX", "JPY", "KRW", "VND", "CLP", "PYG"]);

/** `1234` -> "1.2k", `2500000` -> "2.5M" — for tight spaces (chart bar
 * labels) where a full grouped number + currency suffix won't fit. */
export function formatCompactNumber(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return `${Math.round(amount)}`;
}
