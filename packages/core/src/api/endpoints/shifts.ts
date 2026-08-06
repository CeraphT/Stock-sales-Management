import { api } from "../client";
import type {
  CloseShiftRequest,
  OpenShiftRequest,
  ShiftDetailResponse,
  ShiftHistoryPageResponse,
} from "../types/shifts";

/** Online cash-register shift API (server-side equivalent of the offline
 * localShiftService). Used by the web client's Cash Register + register gate. */
export const shiftsApi = {
  open: (companyId: string, locationId: string, body: OpenShiftRequest) =>
    api.post<ShiftDetailResponse>(
      `/api/companies/${companyId}/locations/${locationId}/shifts/open`,
      body,
    ),

  /** The open shift at a location, or null if none is open. */
  current: (companyId: string, locationId: string) =>
    api.get<ShiftDetailResponse | null>(
      `/api/companies/${companyId}/locations/${locationId}/shifts/current`,
    ),

  close: (companyId: string, shiftId: string, body: CloseShiftRequest) =>
    api.post<ShiftDetailResponse>(`/api/companies/${companyId}/shifts/${shiftId}/close`, body),

  history: (companyId: string, locationId: string, page = 1) =>
    api.get<ShiftHistoryPageResponse>(`/api/companies/${companyId}/shifts`, { locationId, page }),

  /** Full details (incl. per-shift payment breakdown) for one location's recent
   * shifts — the online equivalent of the offline getShiftHistory, used by the
   * Cash Register's takings report + shift table. */
  historyDetailed: (companyId: string, locationId: string) =>
    api.get<ShiftDetailResponse[]>(`/api/companies/${companyId}/locations/${locationId}/shifts/detailed`),

  detail: (companyId: string, shiftId: string) =>
    api.get<ShiftDetailResponse>(`/api/companies/${companyId}/shifts/${shiftId}`),
};
