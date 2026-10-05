import { create } from 'zustand';

/** Whether the app-level initial sync ((app)/_layout, once per company session)
 * is running. Screens that read the local mirror use it to show "loading"
 * instead of an "empty" state while the first pull is still arriving, and
 * SyncingBar shows it app-wide. Per-screen pull-to-refresh keeps its own state. */
interface SyncStatusState {
  initialSyncing: boolean;
  setInitialSyncing: (value: boolean) => void;
}

export const useSyncStatus = create<SyncStatusState>((set) => ({
  initialSyncing: false,
  setInitialSyncing: (value) => set({ initialSyncing: value }),
}));
