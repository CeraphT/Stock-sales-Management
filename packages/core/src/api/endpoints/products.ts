import { api } from "../client";
import type {
  AdjustStockRequest,
  BatchResponse,
  ProductCatalogFilter,
  ProductCatalogPageResponse,
  ProductDetailResponse,
  ProductRequest,
  ReceiveStockRequest,
  RestockSuggestionItem,
  StockMovementResponse,
} from "../types/catalog";

export const productsApi = {
  create: (companyId: string, body: ProductRequest) =>
    api.post<ProductDetailResponse>(`/api/companies/${companyId}/products`, body),

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

  receiveStock: (companyId: string, productId: string, body: ReceiveStockRequest) =>
    api.post<BatchResponse>(`/api/companies/${companyId}/products/${productId}/stock/receive`, body),

  adjustStock: (companyId: string, productId: string, body: AdjustStockRequest) =>
    api.post<BatchResponse>(`/api/companies/${companyId}/products/${productId}/stock/adjust`, body),

  restockSuggestions: (companyId: string, supplierId: string, locationId: string) =>
    api.get<RestockSuggestionItem[]>(`/api/companies/${companyId}/products/restock-suggestions`, { supplierId, locationId }),
};
