import { api } from "../client";

export interface AcknowledgeShiftConflictsResponse {
  acknowledged: number;
}

export interface ConflictShiftItem {
  id: string;
  locationName: string;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingCashAmount: number;
  closingCashAmount: number | null;
  expectedCashAmount: number | null;
  discrepancy: number | null;
  closingNotes: string | null;
}

export interface NegativeBatchItem {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  quantityInBaseUnits: number;
  locationName: string;
  expiryDate: string | null;
}

export interface ReconciliationResponse {
  conflictShifts: ConflictShiftItem[];
  negativeBatches: NegativeBatchItem[];
}

export const reconciliationApi = {
  /** The full reconciliation worklist (admin): unreviewed auto-closed shift
   * conflicts + negative-stock batches. */
  get: (companyId: string) => api.get<ReconciliationResponse>(`/api/companies/${companyId}/reconciliation`),

  /** Mark one conflict shift reviewed. */
  acknowledgeShift: (companyId: string, shiftId: string) =>
    api.post<AcknowledgeShiftConflictsResponse>(`/api/companies/${companyId}/reconciliation/shifts/${shiftId}/acknowledge`),

  /** Mark all conflict shifts reviewed so the dashboard banner clears. */
  acknowledgeShiftConflicts: (companyId: string) =>
    api.post<AcknowledgeShiftConflictsResponse>(`/api/companies/${companyId}/reconciliation/acknowledge-shift-conflicts`),
};
