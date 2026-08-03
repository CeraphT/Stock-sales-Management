import type { SalesSummaryResponse, TopProductItem } from "../api/types/reports";

export interface ReportData {
  companyName: string;
  currency: string;
  from: string;
  to: string;
  summary: SalesSummaryResponse;
  topProducts: TopProductItem[];
}
