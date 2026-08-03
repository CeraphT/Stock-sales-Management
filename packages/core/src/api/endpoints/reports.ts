import { api } from "../client";
import type { SalesSummaryResponse, TopProductItem } from "../types/reports";

export interface ReportDateFilter {
  locationId?: string;
  from?: string;
  to?: string;
}

export const reportsApi = {
  salesSummary: (companyId: string, filter?: ReportDateFilter) =>
    api.get<SalesSummaryResponse>(`/api/companies/${companyId}/reports/sales-summary`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),

  topProducts: (companyId: string, filter?: ReportDateFilter & { limit?: number }) =>
    api.get<TopProductItem[]>(`/api/companies/${companyId}/reports/top-products`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
      limit: filter?.limit,
    }),
};
