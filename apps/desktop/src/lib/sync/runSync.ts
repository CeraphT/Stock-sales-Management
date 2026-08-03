import { syncNow, type SyncResult } from "@stockflow/core/sync/syncNow";

import { initLocalDb } from "@/lib/db/client";
import { queryClient } from "@/lib/queryClient";

/** One sync cycle + reactivity. TanStack Query invalidation after the pull is
 * the desktop replacement for mobile's drizzle useLiveQuery (docs §4). */
export async function runSync(): Promise<SyncResult> {
  await initLocalDb(); // idempotent — guarantees db is registered before sync
  const result = await syncNow();
  await queryClient.invalidateQueries();
  return result;
}
