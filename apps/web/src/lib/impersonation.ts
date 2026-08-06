import type { UserResponse } from "@stockflow/core/api/types/auth";
import type { ImpersonateResponse } from "@stockflow/core/api/types/superAdmin";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { stateStorageAdapter } from "@/platform";
import { useAuthStore } from "@/lib/stores";

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
        const snapshot: SuperAdminSnapshot = {
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
