import { create } from "zustand";

/** Flips true once initLocalDb() resolves — the authed app gates on it so no
 * screen queries the local DB before it's registered with @stockflow/core. */
export const useDbReady = create<{ ready: boolean; error: string | null; setReady: () => void; setError: (e: string) => void }>(
  (set) => ({
    ready: false,
    error: null,
    setReady: () => set({ ready: true }),
    setError: (error) => set({ error }),
  }),
);
