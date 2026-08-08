import { api } from "../client";
import type {
  CashBookItem,
  DeadStockItem,
  DemandForecastItem,
  PurchasesJournalItem,
  SalesJournalItem,
  SalesSummaryResponse,
  TaxDeclarationResponse,
  TopProductItem,
} from "../types/reports";

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

  // Demand forecast: sales velocity, days of cover, suggested reorder, trend.
  demandForecast: (companyId: string, opts?: { days?: number; horizon?: number }) =>
    api.get<DemandForecastItem[]>(`/api/companies/${companyId}/reports/demand-forecast`, {
      days: opts?.days,
      horizon: opts?.horizon,
    }),

  // Dead stock: items holding stock with no sale in the window, by value at risk.
  deadStock: (companyId: string, opts?: { days?: number }) =>
    api.get<DeadStockItem[]>(`/api/companies/${companyId}/reports/dead-stock`, { days: opts?.days }),

  taxDeclaration: (companyId: string, filter?: ReportDateFilter) =>
    api.get<TaxDeclarationResponse>(`/api/companies/${companyId}/reports/tax-declaration`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),

  salesJournal: (companyId: string, filter?: ReportDateFilter) =>
    api.get<SalesJournalItem[]>(`/api/companies/${companyId}/reports/sales-journal`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),

  purchasesJournal: (companyId: string, filter?: ReportDateFilter) =>
    api.get<PurchasesJournalItem[]>(`/api/companies/${companyId}/reports/purchases-journal`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),

  cashBook: (companyId: string, filter?: ReportDateFilter) =>
    api.get<CashBookItem[]>(`/api/companies/${companyId}/reports/cash-book`, {
      locationId: filter?.locationId,
      from: filter?.from,
      to: filter?.to,
    }),
};
