import { PaymentMethod, PurchaseOrderStatus } from "./api/enums";

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

const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.Pending]: "Pending",
  [PurchaseOrderStatus.PartiallyReceived]: "Partially received",
  [PurchaseOrderStatus.Received]: "Received",
  [PurchaseOrderStatus.Cancelled]: "Cancelled",
};

export function purchaseOrderStatusLabel(status: PurchaseOrderStatus): string {
  return PURCHASE_ORDER_STATUS_LABELS[status] ?? "Unknown";
}

/** `1234.5` + "XAF" -> "1,235 XAF". Deliberately not Intl.NumberFormat's
 * `currency` style — that requires a real ISO-4217 code and a fixed set of
 * symbol/decimal rules per currency, neither of which this project can
 * guarantee (a company's `currency` field is free text). Plain grouped
 * number + suffix works for any value and matches how amounts were shown
 * throughout the MAUI client and the seed data ("8,600 XAF"). */
export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString()} ${currency}`;
}

/** `1234` -> "1.2k", `2500000` -> "2.5M" — for tight spaces (chart bar
 * labels) where a full grouped number + currency suffix won't fit. */
export function formatCompactNumber(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return `${Math.round(amount)}`;
}
