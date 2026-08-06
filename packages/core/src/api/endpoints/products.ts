import { api } from "../client";
import type {
  AdjustStockRequest,
  BatchResponse,
  BomLine,
  BomLineRequest,
  BuildAssemblyRequest,
  ProductCatalogFilter,
  ProductCatalogPageResponse,
  ProductDetailResponse,
  ProductRequest,
  ProductSearchResult,
  ReceiveStockRequest,
  RestockSuggestionItem,
  SerialResponse,
  StockAvailabilityResponse,
  StockMovementResponse,
} from "../types/catalog";

export const productsApi = {
  create: (companyId: string, body: ProductRequest) =>
    api.post<ProductDetailResponse>(`/api/companies/${companyId}/products`, body),

  // POS/PO typeahead search — returns ProductSearchResult[] with packaging +
  // stock status (online equivalent of localCatalogQueryService.searchProducts).
  search: (companyId: string, search: string) =>
    api.get<ProductSearchResult[]>(`/api/companies/${companyId}/products`, { search }),

  // Single exact stock-availability lookup (online equivalent of the local
  // getProductAvailability / findByBarcode).
  availability: (companyId: string, query: string) =>
    api.get<StockAvailabilityResponse>(`/api/companies/${companyId}/products/availability`, { query }),

  get: (companyId: string, productId: string) =>
    api.get<ProductDetailResponse>(`/api/companies/${companyId}/products/${productId}`),

  update: (companyId: string, productId: string, body: ProductRequest) =>
    api.put<ProductDetailResponse>(`/api/companies/${companyId}/products/${productId}`, body),

  archive: (companyId: string, productId: string) =>
    api.delete<void>(`/api/companies/${companyId}/products/${productId}`),

  restore: (companyId: string, productId: string) =>
    api.post<void>(`/api/companies/${companyId}/products/${productId}/restore`),

  catalog: (companyId: string, search: string | undefined, page: number, filter: ProductCatalogFilter) =>
    api.get<ProductCatalogPageResponse>(`/api/companies/${companyId}/products/catalog`, {
      search,
      page,
      stockStatus: filter.stockStatus?.join(","),
      favoritesOnly: filter.favoritesOnly,
      expiringSoon: filter.expiringSoon,
      expired: filter.expired,
      archivedOnly: filter.archivedOnly,
    }),

  batches: (companyId: string, productId: string) =>
    api.get<BatchResponse[]>(`/api/companies/${companyId}/products/${productId}/batches`),

  movements: (companyId: string, productId: string) =>
    api.get<StockMovementResponse[]>(`/api/companies/${companyId}/products/${productId}/movements`),

  // Serial/IMEI registry. status: 0 InStock, 1 Sold, 2 Returned (omit for all).
  serials: (companyId: string, productId: string, opts?: { status?: number; locationId?: string }) =>
    api.get<SerialResponse[]>(`/api/companies/${companyId}/products/${productId}/serials`, {
      status: opts?.status,
      locationId: opts?.locationId,
    }),

  // Variant child rows of a parent product.
  variants: (companyId: string, productId: string) =>
    api.get<ProductDetailResponse[]>(`/api/companies/${companyId}/products/${productId}/variants`),

  // Bulk-create variants from labels (e.g. ["S","M","L"]); returns all variants.
  createVariants: (companyId: string, productId: string, labels: string[]) =>
    api.post<ProductDetailResponse[]>(`/api/companies/${companyId}/products/${productId}/variants`, { labels }),

  // Bill of materials (assembly components).
  bom: (companyId: string, productId: string) =>
    api.get<BomLine[]>(`/api/companies/${companyId}/products/${productId}/bom`),

  setBom: (companyId: string, productId: string, lines: BomLineRequest[]) =>
    api.put<void>(`/api/companies/${companyId}/products/${productId}/bom`, { lines }),

  // Build N units: FEFO-deduct components, add finished-goods stock. Returns the batch.
  build: (companyId: string, productId: string, body: BuildAssemblyRequest) =>
    api.post<BatchResponse>(`/api/companies/${companyId}/products/${productId}/build`, body),

  receiveStock: (companyId: string, productId: string, body: ReceiveStockRequest) =>
    api.post<BatchResponse>(`/api/companies/${companyId}/products/${productId}/stock/receive`, body),

  adjustStock: (companyId: string, productId: string, body: AdjustStockRequest) =>
    api.post<BatchResponse>(`/api/companies/${companyId}/products/${productId}/stock/adjust`, body),

  restockSuggestions: (companyId: string, supplierId: string, locationId: string) =>
    api.get<RestockSuggestionItem[]>(`/api/companies/${companyId}/products/restock-suggestions`, { supplierId, locationId }),
};
