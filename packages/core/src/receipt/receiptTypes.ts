import type { PaymentMethod } from "../api/enums";

export interface ReceiptLine {
  productName: string;
  quantityInBaseUnits: number;
  packagingLevelName: string | null;
  unitsPerPackagingLevel: number;
  unitPrice: number;
  lineTotal: number;
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
  cashierName: string;
  currency: string;
  paymentMethod: PaymentMethod;
  productLines: ReceiptLine[];
  serviceLines: ReceiptServiceLine[];
  paymentSplits: ReceiptPaymentSplit[];
  amountTendered: number | null;
  changeDue: number | null;
  total: number;
}
