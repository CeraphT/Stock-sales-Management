import { api } from "../client";

export interface AcknowledgeShiftConflictsResponse {
  acknowledged: number;
}

export const reconciliationApi = {
  /** CompanyAdmin acknowledges the auto-closed shift-conflict warnings so the
   * dashboard "needs reconciliation" banner clears. Returns how many shifts
   * were marked reviewed. */
  acknowledgeShiftConflicts: (companyId: string) =>
    api.post<AcknowledgeShiftConflictsResponse>(`/api/companies/${companyId}/reconciliation/acknowledge-shift-conflicts`),
};
