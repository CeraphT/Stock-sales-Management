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

/** Mirrors PharmaStock.Domain SupportTicketPriority — integers, keep the C# order. */
export enum SupportTicketPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Urgent = 3,
}

export interface SupportMessageInfo {
  id: string;
  authorName: string;
  fromSupport: boolean;
  /** Support-only note (console only — never sent to the reporter). */
  isInternal: boolean;
  body: string;
  createdAt: string;
}

/** The reporter's view of their own request (no triage, no internal notes). */
export interface MySupportTicketDetail {
  id: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  title: string;
  description: string;
  createdAt: string;
  attachmentCount: number;
  messages: SupportMessageInfo[];
}

export interface SupportQueueSummary {
  open: number;
  awaitingSupport: number;
  slaBreached: number;
  unassigned: number;
  mine: number;
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
  // Process fields (optional: absent from an older API).
  priority?: SupportTicketPriority;
  assignedToName?: string | null;
  awaitingSupport?: boolean;
  /** Support replied / resolved and the reporter hasn't opened it yet. */
  unreadByReporter?: boolean;
  slaDueAt?: string | null;
  slaBreached?: boolean;
  messageCount?: number;
  /** Console only. */
  assignedToUserId?: string | null;
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
  priority: SupportTicketPriority;
  assignedToUserId: string | null;
  assignedToName: string | null;
  awaitingSupport: boolean;
  slaDueAt: string | null;
  slaBreached: boolean;
  messages: SupportMessageInfo[];
}
