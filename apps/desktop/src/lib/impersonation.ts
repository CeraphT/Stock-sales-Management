import type { UserResponse } from "@stockflow/core/api/types/auth";
import { clearLocalData } from "@stockflow/core/db/isolation";
import { localDbWriteLock } from "@stockflow/core/db/writeLock";
import type { ImpersonateResponse } from "@stockflow/core/api/types/superAdmin";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { stateStorageAdapter } from "@/platform";
import { initLocalDb } from "@/lib/db/client";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";

/** The SuperAdmin's own session, stashed while they operate inside a company so
 * we can restore it verbatim on exit. */
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
  /** Enter a company: stash the super-admin session and swap the auth store to
   * the company-scoped impersonation token so every existing screen just works. */
  enter: (resp: ImpersonateResponse) => void;
  /** Leave the company and restore the super-admin session. */
  exit: () => void;
  /** Forget any impersonation without restoring a session (used on logout). */
  reset: () => void;
}

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
          token: auth.token ?? "",
          refreshToken: auth.refreshToken ?? "",
          expiresAt: auth.expiresAt ?? "",
          user: auth.user,
        };
        // Company-scoped token, no refresh token (impersonation is time-boxed).
        auth.setSession({
          token: resp.token,
          refreshToken: "",
          expiresAt: resp.expiresAt,
          user: auth.user,
          companyId: resp.companyId,
        });
        if (resp.locationId) {
          auth.setLocation({ locationId: resp.locationId, locationName: resp.locationName ?? "" });
        }
        set({
          active: true,
          companyId: resp.companyId,
          companyName: resp.companyName,
          expiresAt: resp.expiresAt,
          snapshot,
        });
      },

      reset: () => set({ active: false, companyId: null, companyName: null, expiresAt: null, snapshot: null }),

      exit: () => {
        const snap = get().snapshot;
        const auth = useAuthStore.getState();
        if (snap && snap.token) {
          auth.setSession({
            token: snap.token,
            refreshToken: snap.refreshToken,
            expiresAt: snap.expiresAt,
            user: snap.user,
            companyId: null,
          });
        }
        auth.setLocation({ locationId: "", locationName: "" });
        set({ active: false, companyId: null, companyName: null, expiresAt: null, snapshot: null });
      },
    }),
    {
      name: "pharmastock-impersonation",
      storage: createJSONStorage(() => stateStorageAdapter),
    },
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

// ── Desktop: the offline SQLite mirror holds ONE company's data ────────────
// Unlike the online-only web client, the desktop keeps a local mirror, so
// entering/leaving a company must never leave another business's rows on disk.
// Entering needs no wipe here: the Shell mounts fresh after the picker and runs
// isolateCompany() before its first sync. Leaving pushes pending work first,
// then wipes. (Mobile twin: apps/mobile/src/lib/auth/impersonation.ts.)

/** Leave the company: push this device's pending work while the company token
 * is still valid, wipe the mirror, restore the SuperAdmin session. If the push
 * didn't fully succeed (offline, expired token) nothing is wiped and `false` is
 * returned so the UI can warn; call again with `force: true` to leave anyway
 * and drop the unsynced local changes. */
export async function exitCompany({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  let pushedEverything = false;
  try {
    const result = await runSync();
    pushedEverything = result.salesFailed === 0;
  } catch {
    pushedEverything = false;
  }
  if (!pushedEverything && !force) return false;
  await initLocalDb();
  await localDbWriteLock.run(() => clearLocalData());
  queryClient.clear();
  useImpersonation.getState().exit();
  return true;
}
