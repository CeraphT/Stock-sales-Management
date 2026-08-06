import type { StockMovementType, StockStatus } from "../enums";

export interface PackagingLevelInfo {
  id: string;
  unitName: string;
  quantityInBaseUnits: number;
  unitPrice: number;
}

export interface ProductSearchResult {
  productId: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  stockStatus: StockStatus;
  packagingLevels: PackagingLevelInfo[];
  /** Soonest expiry among in-stock batches (ISO), or null — lets the POS warn
   * (but still allow) when a product's stock has passed its expiry date. */
  earliestExpiry: string | null;
  /** Sell-by-measure metadata (weight/length): base units are a fraction of the
   * display unit, so quantities/prices stay per base unit and the UI presents
   * them as `measureUnit` (e.g. grams shown as kg). */
  sellByMeasure?: boolean;
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface StockAvailabilityResponse {
  productId: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  totalBaseUnitsAvailable: number;
  displayQuantity: string;
  stockStatus: StockStatus;
  earliestExpiry: string | null;
  packagingLevels: PackagingLevelInfo[];
}

export interface PackagingLevelRequest {
  unitName: string;
  quantityInBaseUnits: number;
  salePriceOverride: number | null;
}

export interface ProductRequest {
  name: string;
  barcode: string | null;
  categoryId: string | null;
  supplierId: string | null;
  purchasePrice: number;
  salePrice: number;
  lowStockThreshold: number;
  taxRateOverridePercent: number | null;
  isFavorite: boolean;
  packagingLevels: PackagingLevelRequest[] | null;
  sellByMeasure?: boolean;
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface PackagingLevelDetail {
  id: string;
  unitName: string;
  quantityInBaseUnits: number;
  salePriceOverride: number | null;
}

export interface ProductDetailResponse {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchasePrice: number;
  salePrice: number;
  isFavorite: boolean;
  isActive: boolean;
  lowStockThreshold: number;
  taxRateOverridePercent: number | null;
  packagingLevels: PackagingLevelDetail[];
  sellByMeasure?: boolean;
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface RestockSuggestionItem {
  productId: string;
  name: string;
  currentStock: number;
  lowStockThreshold: number;
  suggestedQuantity: number;
  estimatedUnitCost: number;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
  salePrice: number;
  isFavorite: boolean;
  isActive: boolean;
  stockStatus: StockStatus;
  earliestExpiry: string | null;
}

export interface ProductCatalogPageResponse {
  items: ProductCatalogItem[];
  hasMore: boolean;
}

export interface ProductCatalogFilter {
  stockStatus?: StockStatus[];
  favoritesOnly?: boolean;
  expiringSoon?: boolean;
  expired?: boolean;
  archivedOnly?: boolean;
}

export interface CategoryRequest {
  name: string;
}

export interface CategoryResponse {
  id: string;
  name: string;
}

export interface SupplierRequest {
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface SupplierResponse {
  id: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

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
