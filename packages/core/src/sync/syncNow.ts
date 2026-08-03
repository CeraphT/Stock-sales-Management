import { locationsApi } from "../api/endpoints/locations";
import { localDbWriteLock } from "../db/writeLock";
import { getAuthStore } from "../auth/store";

import { pullAll } from "./syncPull";
import { pushAll } from "./syncPush";

export interface SyncResult {
  salesPushed: number;
  salesFailed: number;
  rowsPulled: number;
}

/** Orchestrates one full sync cycle: always push-then-pull, mirroring the
 * MAUI client's SyncService.RunSyncAsync — pulling first would fetch Batch
 * quantities that don't yet reflect this device's own not-yet-pushed
 * deductions. If push fails, the pull is skipped for this cycle entirely:
 * applying a pull against a state this device hasn't fully contributed to
 * yet would risk an inconsistent local view; the next call retries both. */
export async function syncNow(): Promise<SyncResult> {
  return localDbWriteLock.run(async () => {
    const { companyId } = getAuthStore().getState();
    if (!companyId) return { salesPushed: 0, salesFailed: 0, rowsPulled: 0 };

    const locationId = await resolveLocationId(companyId);

    const { pushed, failed } = await pushAll(companyId);

    let rowsPulled = 0;
    if (failed === 0) {
      rowsPulled = await pullAll(companyId, locationId);
    }

    return { salesPushed: pushed, salesFailed: failed, rowsPulled };
  });
}

// Bootstrap/self-heal case: a session created before location tracking
// existed (or a stale one) has no locationId persisted yet — resolve it
// via the API once and cache it, rather than forcing a re-login.
async function resolveLocationId(companyId: string): Promise<string> {
  const { locationId, setLocation } = getAuthStore().getState();
  if (locationId) return locationId;

  const locationsList = await locationsApi.list(companyId);
  const mainLocation = locationsList[0];
  if (!mainLocation) throw new Error("No location found for this business.");

  setLocation({ locationId: mainLocation.id, locationName: mainLocation.name });
  return mainLocation.id;
}
