import { NetworkError } from '@/lib/api/client';
import { syncNow } from '@/lib/sync/syncNow';
import { toast } from '@/lib/ui/toastStore';

/**
 * Call right after an offlineWrites.* change (already applied locally and
 * queued): tries to send it now. Online it's on the server a moment later;
 * offline (or if the server can't be reached) the user is told it's queued —
 * it goes out automatically on the next successful sync. Never throws: the
 * change itself is already safe in the local outbox.
 */
export function afterOfflineWrite(messages: { queued: string; rejected: string }): void {
  syncNow()
    .then((r) => {
      if (r.opsFailed > 0) toast(messages.rejected, 'error');
    })
    .catch((err) => {
      if (err instanceof NetworkError) toast(messages.queued, 'info');
    });
}
