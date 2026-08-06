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

  detail: (companyId: string, shiftId: string) =>
    api.get<ShiftDetailResponse>(`/api/companies/${companyId}/shifts/${shiftId}`),
};
