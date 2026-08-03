import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { UserResponse } from "../api/types/auth";

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  deviceId: string;
  user: UserResponse | null;
  companyId: string | null;
  /** The branch this device operates at — every sync pull/push and sale is
   * scoped to it. Defaults to the company's first ("Main") location right
   * after login; multi-location switching UI doesn't exist yet. */
  locationId: string | null;
  locationName: string | null;
  /** True once the persisted store has finished loading from storage — gates the router's first redirect decision. */
  hasHydrated: boolean;
  setSession: (session: {
    token: string;
    refreshToken: string;
    expiresAt: string;
    user: UserResponse;
    companyId: string | null;
  }) => void;
  setLocation: (location: { locationId: string; locationName: string }) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>;

// Other core modules (api/client.ts, local/*, sync/*) need to read the
// current app's auth state without every function taking the store as a
// parameter — the app that calls createAuthStore() below registers the
// resulting instance here once, at startup.
let registeredStore: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  if (!registeredStore) {
    throw new Error("Auth store not initialized — call createAuthStore() at app startup before any API/sync call.");
  }
  return registeredStore;
}

/**
 * Builds the auth store for the calling app. `storage` is a platform
 * storage adapter (SecureStore on mobile, a Tauri store plugin on desktop —
 * anything matching Zustand's `StateStorage` shape). `generateDeviceId`
 * is injected rather than hardcoded to a single `crypto.randomUUID()` call
 * because the bare `crypto` global's availability is inconsistent across
 * Hermes builds on React Native (crashed the app at boot in Expo Go
 * 57.0.2 on-device) — mobile must keep supplying `expo-crypto`'s
 * `randomUUID()`; a real browser engine (desktop's Tauri webview) can use
 * the standard `crypto.randomUUID()` directly.
 */
export function createAuthStore(storage: StateStorage, generateDeviceId: () => string): AuthStore {
  const store = create<AuthState>()(
    persist(
      (set) => ({
        token: null,
        refreshToken: null,
        expiresAt: null,
        deviceId: generateDeviceId(),
        user: null,
        companyId: null,
        locationId: null,
        locationName: null,
        hasHydrated: false,
        setSession: ({ token, refreshToken, expiresAt, user, companyId }) =>
          set({ token, refreshToken, expiresAt, user, companyId }),
        setLocation: ({ locationId, locationName }) => set({ locationId, locationName }),
        clear: () =>
          set({
            token: null,
            refreshToken: null,
            expiresAt: null,
            user: null,
            companyId: null,
            locationId: null,
            locationName: null,
          }),
        setHasHydrated: (value) => set({ hasHydrated: value }),
      }),
      {
        // Unchanged from mobile's original key — keeps existing installs'
        // persisted sessions valid across this refactor.
        name: "pharmastock-auth",
        storage: createJSONStorage(() => storage),
        // deviceId is intentionally persisted too (default merge behavior) —
        // it must survive logout/login cycles on the same physical device.
        onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      },
    ),
  );

  registeredStore = store;
  return store;
}
