import { api } from "../client";
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetailResponse,
  PurchaseOrderSummaryResponse,
  ReceivePurchaseOrderLineRequest,
} from "../types/purchaseOrders";

export interface PurchaseOrderListFilter {
  status?: number;
  locationId?: string;
  supplierId?: string;
  from?: string;
  to?: string;
}

export const purchaseOrdersApi = {
  create: (companyId: string, body: CreatePurchaseOrderRequest) =>
    api.post<PurchaseOrderDetailResponse>(`/api/companies/${companyId}/purchase-orders`, body),

  list: (companyId: string, filter?: PurchaseOrderListFilter) =>
    api.get<PurchaseOrderSummaryResponse[]>(`/api/companies/${companyId}/purchase-orders`, {
      status: filter?.status,
      locationId: filter?.locationId,
      supplierId: filter?.supplierId,
      from: filter?.from,
      to: filter?.to,
    }),

  get: (companyId: string, id: string) =>
    api.get<PurchaseOrderDetailResponse>(`/api/companies/${companyId}/purchase-orders/${id}`),

  receiveLine: (companyId: string, id: string, lineId: string, body: ReceivePurchaseOrderLineRequest) =>
    api.post<PurchaseOrderDetailResponse>(
      `/api/companies/${companyId}/purchase-orders/${id}/lines/${lineId}/receive`,
      body,
    ),

  cancel: (companyId: string, id: string) =>
    api.post<PurchaseOrderDetailResponse>(`/api/companies/${companyId}/purchase-orders/${id}/cancel`),
};
