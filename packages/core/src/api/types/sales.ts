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
}

export interface SaleSummaryResponse {
  id: string;
  timestamp: string;
  total: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  itemCount: number;
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
}
