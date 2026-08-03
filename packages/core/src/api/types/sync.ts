import type { PaymentMethod, SaleStatus, StockMovementType } from "../enums";

// ---- Push (device -> server) ----

export interface SyncPushSaleLine {
  id: string;
  productId: string;
  batchId: string | null;
  quantityInBaseUnits: number;
  packagingLevelId: string | null;
  unitPrice: number;
  taxRatePercent: number;
}

export interface SyncPushServiceLine {
  id: string;
  serviceId: string;
  quantity: number;
  billedPrice: number;
}

export interface SyncPushPaymentSplit {
  id: string;
  method: PaymentMethod;
  amount: number;
}

export interface SyncPushStockMovement {
  id: string;
  productId: string;
  batchId: string | null;
  locationId: string;
  destinationLocationId: string | null;
  type: StockMovementType;
  quantityInBaseUnits: number;
  reason: string | null;
  userId: string;
  timestamp: string;
}

export interface SyncPushSale {
  id: string;
  locationId: string;
  userId: string;
  customerId: string | null;
  shiftId: string | null;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  amountTendered: number | null;
  changeDue: number | null;
  timestamp: string;
  productLines: SyncPushSaleLine[];
  // Defined server-side but never actually populated by the reference MAUI
  // client either — service-line sync isn't implemented; always send [].
  serviceLines: SyncPushServiceLine[];
  paymentSplits: SyncPushPaymentSplit[];
  stockMovements: SyncPushStockMovement[];
  giftCardCode: string | null;
}

export interface SyncPushShiftOpen {
  id: string;
  locationId: string;
  openedByUserId: string;
  openingCashAmount: number;
  openedAt: string;
}

export interface SyncPushShiftClose {
  shiftId: string;
  closedByUserId: string;
  closingCashAmount: number;
  closingNotes: string | null;
  closedAt: string;
}

export interface SyncPushRequest {
  deviceId: string;
  sales: SyncPushSale[];
  shiftOpens: SyncPushShiftOpen[];
  shiftCloses: SyncPushShiftClose[];
}

export interface SyncPushResult {
  id: string;
  applied: boolean;
  skippedReason: string | null;
}

export interface SyncPushResponse {
  saleResults: SyncPushResult[];
  shiftOpenResults: SyncPushResult[];
  shiftCloseResults: SyncPushResult[];
  serverTimestamp: string;
}

// ---- Pull (server -> device) ----

export interface SyncPullPackagingLevel {
  id: string;
  productId: string;
  unitName: string;
  quantityInBaseUnits: number;
  salePriceOverride: number | null;
}

export interface SyncPullProduct {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  purchasePrice: number;
  salePrice: number;
  supplierId: string | null;
  isFavorite: boolean;
  isActive: boolean;
  lowStockThreshold: number;
  taxRateOverridePercent: number | null;
  updatedAt: string;
  packagingLevels: SyncPullPackagingLevel[];
}

export interface SyncPullCategory {
  id: string;
  name: string;
  updatedAt: string;
}

export interface SyncPullCustomer {
  id: string;
  name: string;
  phone: string | null;
  creditBalance: number;
  loyaltyPointsBalance: number;
  loyaltyStoreCreditBalance: number;
  updatedAt: string;
}

export interface SyncPullSupplier {
  id: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  updatedAt: string;
}

export interface SyncPullBatch {
  id: string;
  productId: string;
  locationId: string;
  batchNumber: string;
  expiryDate: string | null;
  quantityInBaseUnits: number;
  purchasePricePerBaseUnit: number;
  updatedAt: string;
}

export interface SyncPullLocation {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface SyncPullCompanyInfo {
  id: string;
  name: string;
  uniqueCode: string;
  currency: string;
  defaultTaxRatePercent: number;
  loyaltyEnabled: boolean;
  loyaltyEarnRateAmount: number;
  loyaltyPointValue: number;
}

export interface SyncPullGiftCard {
  id: string;
  code: string;
  initialValue: number;
  remainingValue: number;
  active: boolean;
}

/** Minimal cached mirror only — FK-satisfaction + display, never locally-authenticatable. */
export interface SyncPullUser {
  id: string;
  name: string;
  phone: string;
}

export interface SyncPullStockMovement {
  id: string;
  productId: string;
  batchId: string | null;
  locationId: string;
  destinationLocationId: string | null;
  type: StockMovementType;
  quantityInBaseUnits: number;
  reason: string | null;
  userId: string;
  timestamp: string;
}

export interface SyncPullResponse {
  serverTimestamp: string;
  company: SyncPullCompanyInfo;
  locations: SyncPullLocation[];
  products: SyncPullProduct[];
  categories: SyncPullCategory[];
  customers: SyncPullCustomer[];
  suppliers: SyncPullSupplier[];
  batches: SyncPullBatch[];
  stockMovements: SyncPullStockMovement[];
  users: SyncPullUser[];
  giftCards: SyncPullGiftCard[];
}
