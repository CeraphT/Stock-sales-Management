import { NetworkError } from "../api/client";
import { supportApi } from "../api/endpoints/support";
import type { CreateSupportTicketRequest } from "../api/types/support";
import { generateId } from "../idGenerator";
import { offlineWrites } from "../local/offlineWrites";

/** Max images per request and per-image size, enforced by every client before
 * sending (the server re-checks: 5 images, 5 MB each, 15 MB total). */
export const SUPPORT_MAX_IMAGES = 5;
export const SUPPORT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORT_MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/**
 * File a support request from any client. Sends it now; if the server can't
 * be reached and there's a company in the session (offline-capable clients),
 * it's queued in the outbox and sent with the next sync — a user who is
 * "blocked" is often exactly the one without a connection. The client-
 * generated id makes the later replay idempotent.
 *
 * Returns "sent" or "queued". Throws on validation errors, or on a network
 * failure when it can't be queued (no company / online-only client).
 */
export async function submitSupportTicket(
  request: CreateSupportTicketRequest,
  opts: { companyId: string | null; canQueueOffline: boolean },
): Promise<"sent" | "queued"> {
  const body = { ...request, id: request.id ?? generateId() };
  try {
    await supportApi.create(body);
    return "sent";
  } catch (err) {
    if (err instanceof NetworkError && opts.canQueueOffline && opts.companyId) {
      await offlineWrites.queueSupportTicket(opts.companyId, body);
      return "queued";
    }
    throw err;
  }
}
