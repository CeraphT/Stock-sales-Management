import type { PurchaseOrderStatus } from "../api/enums";

export interface PurchaseOrderPdfLine {
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
}

export interface PurchaseOrderPdfData {
  companyName: string;
  currency: string;
  id: string;
  createdAt: string;
  supplierName: string;
  locationName: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  lines: PurchaseOrderPdfLine[];
}
