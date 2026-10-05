import { api, apiFetchBlob } from "../client";
import type {
  CreateSupportTicketRequest,
  MySupportTicketDetail,
  SupportQueueSummary,
  SupportTicketDetail,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketSummary,
} from "../types/support";

/** In-app support: any signed-in user files a request; the SuperAdmin triages
 * it from the web console (`/api/superadmin/support`). */
export const supportApi = {
  create: (body: CreateSupportTicketRequest) => api.post<{ id: string }>("/api/support/tickets", body),
  mine: () => api.get<SupportTicketSummary[]>("/api/support/tickets/mine"),
  /** Opening it marks the support reply as read. */
  mineDetail: (id: string) => api.get<MySupportTicketDetail>(`/api/support/tickets/mine/${id}`),
  /** Reporter follow-up — reopens a resolved/closed request. */
  mineReply: (id: string, body: string) =>
    api.post<{ id: string; status: SupportTicketStatus }>(`/api/support/tickets/mine/${id}/messages`, { body }),
  unreadCount: () => api.get<{ count: number }>("/api/support/tickets/mine/unread-count"),

  // ── SuperAdmin ──
  list: (status?: SupportTicketStatus) => api.get<SupportTicketSummary[]>("/api/superadmin/support", { status }),
  summary: () => api.get<SupportQueueSummary>("/api/superadmin/support/summary"),
  get: (id: string) => api.get<SupportTicketDetail>(`/api/superadmin/support/${id}`),
  note: (id: string, body: string) => api.post<{ id: string }>(`/api/superadmin/support/${id}/note`, { body }),
  assign: (id: string, toMe: boolean) => api.post<{ id: string }>(`/api/superadmin/support/${id}/assign`, { toMe }),
  setPriority: (id: string, priority: SupportTicketPriority) =>
    api.post<{ id: string }>(`/api/superadmin/support/${id}/priority`, { priority }),
  /** The image bytes (needs the auth header, so not a plain <img src>). */
  attachment: (id: string, attachmentId: string) => apiFetchBlob(`/api/superadmin/support/${id}/attachments/${attachmentId}`),
  setStatus: (id: string, status: SupportTicketStatus) =>
    api.post<{ id: string; status: SupportTicketStatus }>(`/api/superadmin/support/${id}/status`, { status }),
  reply: (id: string, reply: string, status?: SupportTicketStatus) =>
    api.post<{ id: string; status: SupportTicketStatus }>(`/api/superadmin/support/${id}/reply`, { reply, status }),
};
