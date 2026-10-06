import * as SecureStore from 'expo-secure-store';

import { locationsApi } from '@/lib/api/endpoints/locations';
import type { AuthResponse, LocationResponse } from '@/lib/api/types/auth';
import { useAuthStore } from '@/lib/auth/store';
import { deviceName, devicePlatform } from '@/lib/device';
import { syncNow } from '@/lib/sync/syncNow';
import { membershipsApi } from '@stockflow/core/api/endpoints/memberships';
import { clearLocalData, countUnsynced, localCompanyId } from '@stockflow/core/db/isolation';
import { localDbWriteLock } from '@stockflow/core/db/writeLock';

/* Opening, leaving and switching shops on mobile. Same rules as the web/desktop
 * lib/session.ts: opening a different shop first sends this device's unsent work
 * (sales, shifts, queued writes) with the previous shop's session; if some can't
 * be sent, the caller must get an explicit "erase it" before the local copy is
 * wiped. The last branch used per shop is remembered on the device. */

const lastLocationKey = (companyId: string) => `stockflow-last-location.${companyId}`;

export function storeSession(auth: AuthResponse): void {
  useAuthStore.getState().setSession({
    token: auth.token,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
    user: auth.user,
    companyId: auth.companyId,
  });
}

/** Sets the operating branch and remembers it for this shop on this device. */
export function chooseLocation(companyId: string, location: { id: string; name: string }): void {
  useAuthStore.getState().setLocation({ locationId: location.id, locationName: location.name });
  void SecureStore.setItemAsync(lastLocationKey(companyId), location.id).catch(() => {});
}

/** The branch last used here for this shop, else the only one. Returns every
 * branch when the shop has several and none is remembered, so the caller asks. */
export async function resolveDefaultLocation(companyId: string): Promise<LocationResponse[] | null> {
  const locations = (await locationsApi.list(companyId)).filter((l) => l.active);
  const rememberedId = await SecureStore.getItemAsync(lastLocationKey(companyId)).catch(() => null);
  const remembered = locations.find((l) => l.id === rememberedId);
  if (remembered) {
    chooseLocation(companyId, remembered);
    return null;
  }
  if (locations.length > 1) return locations;
  if (locations[0]) chooseLocation(companyId, locations[0]);
  return null;
}

export type OpenShopResult =
  | { kind: 'opened' }
  | { kind: 'pickLocation'; locations: LocationResponse[] }
  | { kind: 'unsynced'; count: number };

export async function openShop(companyId: string, { discardUnsynced = false } = {}): Promise<OpenShopResult> {
  const previous = await localCompanyId();
  if (previous && previous !== companyId) {
    let pending = await countUnsynced();
    if (pending > 0 && useAuthStore.getState().companyId === previous) {
      try {
        await syncNow();
      } catch {
        /* offline: counted below */
      }
      pending = await countUnsynced();
    }
    if (pending > 0 && !discardUnsynced) return { kind: 'unsynced', count: pending };
    await localDbWriteLock.run(() => clearLocalData());
  }

  const { deviceId } = useAuthStore.getState();
  const auth = await membershipsApi.selectCompany({ companyId, deviceId, deviceName, platform: devicePlatform });
  storeSession(auth);
  const choices = await resolveDefaultLocation(companyId);
  return choices ? { kind: 'pickLocation', locations: choices } : { kind: 'opened' };
}

/** Back to "My shops" (still signed in). Sends pending work when it can; nothing
 * is erased here, only opening a different shop guards and wipes. */
export async function leaveShop(): Promise<void> {
  try {
    await syncNow();
  } catch {
    /* offline: kept on the device */
  }
  useAuthStore.getState().leaveCompany();
}
