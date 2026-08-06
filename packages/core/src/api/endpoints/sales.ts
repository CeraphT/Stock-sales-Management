import { api } from "../client";
import type {
  CreateSaleRequest,
  HeldSaleSummaryResponse,
  HoldSaleRequest,
  RefundResponse,
  SaleDetailResponse,
  SaleHistoryPageResponse,
  SaleResponse,
} from "../types/sales";

export interface HeldSalesFilter {
  locationId?: string;
  from?: string;
  to?: string;
}

export const salesApi = {
  // Direct online sale creation — bypasses the offline-first local path
  // entirely. Only used when the cart has service lines: service-line sync
  // was never wired end to end even in the MAUI client (see syncPush.ts's
  // `serviceLines: []` note), so a sale that includes one requires
  // connectivity right now rather than a half-working offline queue.
  create: (companyId: string, body: CreateSaleRequest) =>
    api.post<SaleResponse>(`/api/companies/${companyId}/sales`, body),

  // Park a cart as a Held sale (no payment yet) — online equivalent of the
  // offline localSalesService.holdSale.
  hold: (companyId: string, body: HoldSaleRequest) =>
    api.post<SaleResponse>(`/api/companies/${companyId}/sales/hold`, body),

  history: (companyId: string, page: number, from?: string, to?: string) =>
    api.get<SaleHistoryPageResponse>(`/api/companies/${companyId}/sales`, { page, from, to }),

  detail: (companyId: string, saleId: string) =>
    api.get<SaleDetailResponse>(`/api/companies/${companyId}/sales/${saleId}`),

  // Cross-location — omitting locationId returns held sales at every
  // branch, which is the point of the audit/history view (as opposed to
  // localSalesService.getHeldSales, which only ever sees this device's
  // own current location from the local sync mirror).
  held: (companyId: string, filter?: HeldSalesFilter) =>
    api.get<HeldSaleSummaryResponse[]>(`/api/companies/${companyId}/sales/held`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),

  discardHeld: (companyId: string, saleId: string) => api.delete<void>(`/api/companies/${companyId}/sales/${saleId}`),

  refund: (companyId: string, saleId: string) =>
    api.post<RefundResponse>(`/api/companies/${companyId}/sales/${saleId}/refund`),
};
