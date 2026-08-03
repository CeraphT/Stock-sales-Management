import type { StockMovementType } from "../enums";

export interface ReceiveStockRequest {
  locationId: string;
  batchNumber: string;
  expiryDate: string | null;
  quantityInBaseUnits: number;
  purchasePricePerBaseUnit: number | null;
}

export interface AdjustStockRequest {
  batchId: string;
  deltaInBaseUnits: number;
  reason: string;
}

export interface BatchResponse {
  id: string;
  locationId: string;
  batchNumber: string;
  expiryDate: string | null;
  quantityInBaseUnits: number;
  purchasePricePerBaseUnit: number;
  receivedAt: string;
}

export interface StockMovementResponse {
  id: string;
  type: StockMovementType;
  quantityInBaseUnits: number;
  reason: string | null;
  batchId: string | null;
  batchNumber: string | null;
  userId: string;
  userName: string;
  timestamp: string;
}
