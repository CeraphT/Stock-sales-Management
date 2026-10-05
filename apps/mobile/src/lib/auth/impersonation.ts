import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { clearLocalData } from '@stockflow/core/db/isolation';
import { localDbWriteLock } from '@stockflow/core/db/writeLock';

import type { UserResponse } from '@/lib/api/types/auth';
import type { ImpersonateResponse } from '@stockflow/core/api/types/superAdmin';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';

/**
 * SuperAdmin "enter a company" on mobile (M8) — the mobile port of
 * apps/web/src/lib/impersonation.ts. The SuperAdmin's own session is stashed
 * and the auth store is swapped to the company-scoped impersonation token
 * (POST /api/superadmin/companies/{id}/impersonate, ~2 h, no refresh token),
 * so every existing screen just works inside that company.
 *
 * Mobile-only twist: the offline SQLite mirror holds ONE company's data, so
 * entering and leaving always wipes it (pushing anything pending first on the
 * way out) — a device must never mix two businesses' rows.
 */

interface SuperAdminSnapshot {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: UserResponse;
}

interface ImpersonationState {
  active: boolean;
  companyId: string | null;
  companyName: string | null;
  expiresAt: string | null;
  snapshot: SuperAdminSnapshot | null;
  enter: (resp: ImpersonateResponse) => void;
  exit: () => void;
  /** Forget any impersonation without restoring a session (used on logout). */
  reset: () => void;
}

// Holds the SuperAdmin's tokens, so it lives in SecureStore like the auth store.
const secureStoreAdapter: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useImpersonation = create<ImpersonationState>()(
  persist(
    (set, get) => ({
      active: false,
      companyId: null,
      companyName: null,
      expiresAt: null,
      snapshot: null,

      enter: (resp) => {
        const auth = useAuthStore.getState();
        if (!auth.user) return;
        // Re-entering while already inside a company keeps the ORIGINAL
        // SuperAdmin session, never the previous impersonation token.
        const snapshot: SuperAdminSnapshot = get().snapshot ?? {
          token: auth.token ?? '',
          refreshToken: auth.refreshToken ?? '',
          expiresAt: auth.expiresAt ?? '',
          user: auth.user,
        };
        auth.setSession({ token: resp.token, refreshToken: '', expiresAt: resp.expiresAt, user: auth.user, companyId: resp.companyId });
        auth.setLocation({ locationId: resp.locationId ?? '', locationName: resp.locationName ?? '' });
        set({ active: true, companyId: resp.companyId, companyName: resp.companyName, expiresAt: resp.expiresAt, snapshot });
      },

      reset: () => set({ active: false, companyId: null, companyName: null, expiresAt: null, snapshot: null }),

      exit: () => {
        const snap = get().snapshot;
        const auth = useAuthStore.getState();
        if (snap?.token) {
          auth.setSession({ token: snap.token, refreshToken: snap.refreshToken, expiresAt: snap.expiresAt, user: snap.user, companyId: null });
        }
        auth.setLocation({ locationId: '', locationName: '' });
        set({ active: false, companyId: null, companyName: null, expiresAt: null, snapshot: null });
      },
    }),
    { name: 'pharmastock-impersonation', storage: createJSONStorage(() => secureStoreAdapter) },
  ),
);

// Any end of the session — explicit logout, idle logout, or a 401 the refresh
// can't recover (impersonation tokens have no refresh token) — must also end
// the impersonation, or the next SuperAdmin login would resume a stale one.
useAuthStore.subscribe((state, prev) => {
  if (prev.token && !state.token && useImpersonation.getState().active) {
    useImpersonation.getState().reset();
  }
});

/** Wipe the offline mirror under the same lock syncNow uses, so a sync can't
 * be mid-write while the tables are emptied. */
function wipeLocalMirror() {
  return localDbWriteLock.run(() => clearLocalData());
}

/** Enter a company: wipe whatever the device held, swap to the company token,
 * then pull that company's data. A failed pull is not fatal — the screens work
 * online and the next sync retries. */
export async function enterCompany(resp: ImpersonateResponse): Promise<void> {
  await wipeLocalMirror();
  useImpersonation.getState().enter(resp);
  try {
    await syncNow();
  } catch {
    /* offline / transient — next sync retries */
  }
}

/** Leave the company: push this device's pending work while the company token
 * is still valid, wipe the mirror, restore the SuperAdmin session.
 * If the push didn't fully succeed (offline, expired token), nothing is wiped
 * and `false` is returned so the UI can warn first; call again with
 * `force: true` to leave anyway and drop the unsynced local changes. */
export async function exitCompany({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  let pushedEverything = false;
  try {
    const result = await syncNow();
    pushedEverything = result.salesFailed === 0;
  } catch {
    pushedEverything = false;
  }
  if (!pushedEverything && !force) return false;
  await wipeLocalMirror();
  useImpersonation.getState().exit();
  return true;
}
