import type { PurchaseOrderStatus } from "../enums";

export interface PurchaseOrderLineRequest {
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePurchaseOrderRequest {
  locationId: string;
  supplierId: string;
  notes: string | null;
  lines: PurchaseOrderLineRequest[];
}

export interface ReceivePurchaseOrderLineRequest {
  quantityReceivedNow: number;
  batchNumber: string;
  expiryDate: string | null;
  actualUnitCost: number | null;
  // Serial-tracked products only: one serial/IMEI per unit received; its length
  // must equal quantityReceivedNow. Omitted for non-serial products.
  serialNumbers?: string[];
}

export interface PurchaseOrderLineResponse {
  id: string;
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  serialTracked: boolean;
}

export interface PurchaseOrderSummaryResponse {
  id: string;
  createdAt: string;
  supplierName: string;
  locationName: string;
  status: PurchaseOrderStatus;
  lineCount: number;
  totalCost: number;
}

export interface PurchaseOrderDetailResponse {
  id: string;
  createdAt: string;
  supplierName: string;
  locationName: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  lines: PurchaseOrderLineResponse[];
}
