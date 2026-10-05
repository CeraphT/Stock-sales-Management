import { api, apiFetchBlob } from "../client";
import type {
  CreateSupportTicketRequest,
  SupportTicketDetail,
  SupportTicketStatus,
  SupportTicketSummary,
} from "../types/support";

/** In-app support: any signed-in user files a request; the SuperAdmin triages
 * it from the web console (`/api/superadmin/support`). */
export const supportApi = {
  create: (body: CreateSupportTicketRequest) => api.post<{ id: string }>("/api/support/tickets", body),
  mine: () => api.get<SupportTicketSummary[]>("/api/support/tickets/mine"),

  // ── SuperAdmin ──
  list: (status?: SupportTicketStatus) => api.get<SupportTicketSummary[]>("/api/superadmin/support", { status }),
  get: (id: string) => api.get<SupportTicketDetail>(`/api/superadmin/support/${id}`),
  /** The image bytes (needs the auth header, so not a plain <img src>). */
  attachment: (id: string, attachmentId: string) => apiFetchBlob(`/api/superadmin/support/${id}/attachments/${attachmentId}`),
  setStatus: (id: string, status: SupportTicketStatus) =>
    api.post<{ id: string; status: SupportTicketStatus }>(`/api/superadmin/support/${id}/status`, { status }),
  reply: (id: string, reply: string, status?: SupportTicketStatus) =>
    api.post<{ id: string; status: SupportTicketStatus }>(`/api/superadmin/support/${id}/reply`, { reply, status }),
};
