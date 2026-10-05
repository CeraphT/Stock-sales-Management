import { supportApi } from "../api/endpoints/support";
import { SupportTicketStatus, type SupportTicketSummary } from "../api/types/support";

export interface SupportUpdate {
  ticketId: string;
  title: string;
  /** "resolved" when support resolved/closed it, otherwise a new reply. */
  kind: "resolved" | "reply";
  reply: string | null;
}

/**
 * Support replies / resolutions the user hasn't seen yet — the apps show each
 * once as a pop-up ("Your request X was resolved — View"). `alreadyShown` is
 * the app's session memory so the same update isn't popped twice before the
 * user opens it (opening the request on the server clears the flag for good).
 * Network errors resolve to [] — never blocks or alarms anyone.
 */
export async function pendingSupportUpdates(alreadyShown: Set<string>): Promise<SupportUpdate[]> {
  let rows: SupportTicketSummary[];
  try {
    rows = await supportApi.mine();
  } catch {
    return [];
  }
  return rows
    .filter((r) => r.unreadByReporter && !alreadyShown.has(`${r.id}:${r.updatedAt}`))
    .map((r) => {
      alreadyShown.add(`${r.id}:${r.updatedAt}`);
      const resolved = r.status === SupportTicketStatus.Resolved || r.status === SupportTicketStatus.Closed;
      return { ticketId: r.id, title: r.title, kind: resolved ? "resolved" : "reply", reply: r.adminReply } as SupportUpdate;
    });
}
