import { create } from 'zustand';

/** The last app screen the user was on before opening Support — attached to
 * the request so the SuperAdmin knows where the problem happened. Updated by
 * (app)/_layout on every route change (Support itself excluded). */
export const useLastScreen = create<{ path: string | null; set: (path: string) => void }>((set) => ({
  path: null,
  set: (path) => set({ path }),
}));
