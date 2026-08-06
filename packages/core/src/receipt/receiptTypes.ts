import type { PaymentMethod } from "../api/enums";

export interface ReceiptLine {
  productName: string;
  quantityInBaseUnits: number;
  packagingLevelName: string | null;
  unitsPerPackagingLevel: number;
  unitPrice: number;
  lineTotal: number;
  /** Sell-by-measure metadata (weight/length): when set, the receipt shows the
   * quantity as its display unit (e.g. "1.25 kg") and the price per that unit. */
  sellByMeasure?: boolean;
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface ReceiptServiceLine {
  serviceName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptPaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export interface ReceiptData {
  saleId: string;
  timestamp: string;
  companyName: string;
  locationName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  footer?: string | null;
  cashierName: string;
  currency: string;
  paymentMethod: PaymentMethod;
  productLines: ReceiptLine[];
  serviceLines: ReceiptServiceLine[];
  paymentSplits: ReceiptPaymentSplit[];
  amountTendered: number | null;
  changeDue: number | null;
  total: number;
  /** VAT/TVA embedded in the (tax-inclusive) total; 0 when tax is off. */
  taxTotal?: number;
  /** Business customer's taxpayer number (NIU), printed on a B2B invoice. */
  customerTaxId?: string | null;
  /** Sequential tax-invoice number + the seller's own NIU (tax-invoice header). */
  invoiceNumber?: number | null;
  sellerTaxId?: string | null;
  /** Paper width in px for the receipt body (thermal rolls vs A4). Default 302 (~80mm). */
  paperWidthPx?: number;
}
