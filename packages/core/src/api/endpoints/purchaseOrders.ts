import { api } from "../client";
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetailResponse,
  PurchaseOrderLineRequest,
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

  /** Append a line to an open order (consolidates reorders into one PO per supplier). */
  addLine: (companyId: string, id: string, body: PurchaseOrderLineRequest) =>
    api.post<PurchaseOrderDetailResponse>(`/api/companies/${companyId}/purchase-orders/${id}/lines`, body),

  receiveLine: (companyId: string, id: string, lineId: string, body: ReceivePurchaseOrderLineRequest) =>
    api.post<PurchaseOrderDetailResponse>(
      `/api/companies/${companyId}/purchase-orders/${id}/lines/${lineId}/receive`,
      body,
    ),

  cancel: (companyId: string, id: string) =>
    api.post<PurchaseOrderDetailResponse>(`/api/companies/${companyId}/purchase-orders/${id}/cancel`),

  /** Stop expecting the outstanding quantity on a single line (accepts what was
   * already received; recomputes the order's status). */
  cancelLineRemaining: (companyId: string, id: string, lineId: string) =>
    api.post<PurchaseOrderDetailResponse>(
      `/api/companies/${companyId}/purchase-orders/${id}/lines/${lineId}/cancel-remaining`,
    ),
};
