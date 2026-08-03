import { api } from "../client";
import type { DashboardSummaryResponse } from "../types/reports";

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummaryResponse>(`/api/companies/${companyId}/dashboard/summary`),
};
