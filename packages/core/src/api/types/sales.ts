import type { PaymentMethod, SaleStatus } from "../enums";

export interface SaleLineRequest {
  productId: string;
  quantity: number;
  packagingLevelId: string | null;
}

export interface ServiceLineRequest {
  serviceId: string;
  quantity: number;
}

export interface PaymentSplitRequest {
  method: PaymentMethod;
  amount: number;
}

export interface CreateSaleRequest {
  locationId: string;
  customerId: string | null;
  paymentMethod: PaymentMethod;
  productLines: SaleLineRequest[] | null;
  serviceLines: ServiceLineRequest[] | null;
  paymentSplits: PaymentSplitRequest[] | null;
  amountTendered?: number | null;
  giftCardCode?: string | null;
  /** Client-set for the offline path: whether VAT is added on top (B2B). The
   * server re-derives this from the customer on push; local uses it immediately. */
  taxAddedOnTop?: boolean;
}

export interface SaleLineResponse {
  productId: string;
  productName: string;
  batchId: string | null;
  batchNumber: string | null;
  quantityInBaseUnits: number;
  packagingLevelId: string | null;
  packagingLevelName: string | null;
  unitsPerPackagingLevel: number;
  unitPrice: number;
  taxRatePercent: number;
  lineTotal: number;
  /** Sell-by-measure metadata (weight/length) so the receipt/detail can show the
   * quantity as its display unit (e.g. 1250 base units shown as "1.25 kg") and
   * the price per that unit. `sellByMeasure` false → treat as a plain unit line. */
  sellByMeasure?: boolean;
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface ServiceLineResponse {
  serviceId: string;
  serviceName: string;
  quantity: number;
  billedPrice: number;
  lineTotal: number;
}

export interface PaymentSplitResponse {
  method: PaymentMethod;
  amount: number;
}

export interface SaleResponse {
  id: string;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  timestamp: string;
  productLines: SaleLineResponse[];
  serviceLines: ServiceLineResponse[];
  paymentSplits: PaymentSplitResponse[];
  amountTendered: number | null;
  changeDue: number | null;
  taxAddedOnTop: boolean;
}

/** 0 = a real sale, 1 = a gift-card issuance (non-revenue audit line). */
export enum SaleTimelineKind {
  Sale = 0,
  GiftCardIssued = 1,
}

export interface SaleSummaryResponse {
  id: string;
  timestamp: string;
  total: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  itemCount: number;
  customerName: string | null;
  kind: SaleTimelineKind;
}

export interface SaleHistoryPageResponse {
  items: SaleSummaryResponse[];
  hasMore: boolean;
}

export interface HoldSaleRequest {
  locationId: string;
  customerId: string | null;
  productLines: SaleLineRequest[];
}

export interface HeldSaleSummaryResponse {
  id: string;
  timestamp: string;
  total: number;
  cashierName: string;
  locationName: string;
  itemCount: number;
}

export interface RefundResponse {
  saleId: string;
  status: SaleStatus;
  refundedAmount: number;
}

export interface SaleDetailResponse {
  id: string;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  timestamp: string;
  cashierName: string;
  locationName: string;
  productLines: SaleLineResponse[];
  serviceLines: ServiceLineResponse[];
  paymentSplits: PaymentSplitResponse[];
  amountTendered: number | null;
  changeDue: number | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  taxAddedOnTop: boolean;
  customerTaxId: string | null;
  invoiceNumber: number | null;
  sellerTaxId: string | null;
}
