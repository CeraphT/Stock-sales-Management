import type { DevicePlatform } from "../enums";

/** Mirrors PharmaStock.Domain SupportTicketCategory — integers, keep the C# order. */
export enum SupportTicketCategory {
  Bug = 0,
  Blocked = 1,
  Question = 2,
}

/** Mirrors PharmaStock.Domain SupportTicketStatus — integers, keep the C# order. */
export enum SupportTicketStatus {
  Open = 0,
  InProgress = 1,
  Resolved = 2,
  Closed = 3,
}

export interface SupportAttachmentUpload {
  fileName: string;
  contentType: string;
  /** Raw base64 (no data: prefix). */
  dataBase64: string;
}

export interface CreateSupportTicketRequest {
  category: SupportTicketCategory;
  description: string;
  platform: DevicePlatform;
  title?: string | null;
  appVersion?: string | null;
  deviceInfo?: string | null;
  screen?: string | null;
  attachments?: SupportAttachmentUpload[];
  /** Client-generated (offline outbox) — a replay is acknowledged, not duplicated. */
  id?: string;
}

export interface SupportTicketSummary {
  id: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  title: string;
  createdAt: string;
  updatedAt: string;
  adminReply: string | null;
  repliedAt: string | null;
  attachmentCount: number;
  /** Console only (null in "my requests"). */
  companyName: string | null;
  userName: string | null;
  platform: DevicePlatform;
}

export interface SupportAttachmentInfo {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface SupportTicketDetail {
  id: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  adminReply: string | null;
  repliedAt: string | null;
  companyId: string | null;
  companyName: string | null;
  userId: string;
  userName: string;
  userPhone: string | null;
  platform: DevicePlatform;
  appVersion: string | null;
  deviceInfo: string | null;
  screen: string | null;
  attachments: SupportAttachmentInfo[];
}
