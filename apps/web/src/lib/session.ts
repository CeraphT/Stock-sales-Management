import { locationsApi } from "@stockflow/core/api/endpoints/locations";
import { membershipsApi } from "@stockflow/core/api/endpoints/memberships";
import type { AuthResponse, LocationResponse } from "@stockflow/core/api/types/auth";
import { clearLocalData, countUnsynced, localCompanyId } from "@stockflow/core/db/isolation";
import { localDbWriteLock } from "@stockflow/core/db/writeLock";

import { initLocalDb } from "@/lib/db/client";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { DevicePlatform } from "@stockflow/core/api/enums";
import { deviceName } from "@/platform";

const LAST_LOCATION_KEY = (companyId: string) => `stockflow-last-location:${companyId}`;

function readLastLocation(companyId: string): string | null {
  try {
    return localStorage.getItem(LAST_LOCATION_KEY(companyId));
  } catch {
    return null;
  }
}

export function storeSession(auth: AuthResponse): void {
  useAuthStore.getState().setSession({
    token: auth.token,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
    user: auth.user,
    companyId: auth.companyId,
  });
}

/** Sets the operating branch and remembers it for this business on this device. */
export function chooseLocation(companyId: string, location: { id: string; name: string }): void {
  useAuthStore.getState().setLocation({ locationId: location.id, locationName: location.name });
  try {
    localStorage.setItem(LAST_LOCATION_KEY(companyId), location.id);
  } catch {
    /* per-device convenience only */
  }
}

/** After login/company-create, pick the operating branch: the one last used here
 * for this business, else the first ("Main"). Returns every branch when the
 * business has several and none is remembered, so the caller can ask. */
export async function resolveDefaultLocation(companyId: string): Promise<LocationResponse[] | null> {
  const locations = (await locationsApi.list(companyId)).filter((l) => l.active);
  const remembered = locations.find((l) => l.id === readLastLocation(companyId));
  if (remembered) {
    chooseLocation(companyId, remembered);
    return null;
  }
  if (locations.length > 1) return locations;
  const first = locations[0];
  if (first) chooseLocation(companyId, first);
  return null;
}

export type OpenShopResult =
  | { kind: "opened" }
  | { kind: "pickLocation"; locations: LocationResponse[] }
  | { kind: "unsynced"; count: number };

/**
 * Opens one of the account's businesses. Safe switch: if this device still holds
 * another business's work that the server hasn't received, try to send it first
 * (the current session still belongs to that business); if some is still
 * pending, stop and report it — opening a different business wipes the local
 * copy. `discardUnsynced` is the user's explicit "erase it anyway".
 */
export async function openShop(companyId: string, { discardUnsynced = false } = {}): Promise<OpenShopResult> {
  await initLocalDb();
  const previous = await localCompanyId();
  if (previous && previous !== companyId) {
    let pending = await countUnsynced();
    if (pending > 0 && useAuthStore.getState().companyId === previous) {
      try {
        await runSync();
      } catch {
        /* offline: counted below */
      }
      pending = await countUnsynced();
    }
    if (pending > 0 && !discardUnsynced) return { kind: "unsynced", count: pending };
    await localDbWriteLock.run(() => clearLocalData());
  }

  const { deviceId } = useAuthStore.getState();
  const auth = await membershipsApi.selectCompany({ companyId, deviceId, deviceName, platform: DevicePlatform.Web });
  queryClient.clear();
  storeSession(auth);
  const choices = await resolveDefaultLocation(companyId);
  return choices ? { kind: "pickLocation", locations: choices } : { kind: "opened" };
}

/** Back to "My shops" (the account stays signed in). Sends pending work first
 * when it can; nothing is erased here — only opening a different business does. */
export async function leaveShop(): Promise<void> {
  try {
    await runSync();
  } catch {
    /* offline: kept on the device, openShop guards the switch */
  }
  useAuthStore.getState().leaveCompany();
}

export function logout(): void {
  queryClient.clear();
  useAuthStore.getState().clear();
}
