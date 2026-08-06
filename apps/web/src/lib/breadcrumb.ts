import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { create } from "zustand";

export interface Crumb {
  label: string;
  to?: string;
}

/** Detail screens publish a breadcrumb trail keyed to their exact path (e.g.
 * ["Products" › "Paracetamol 500mg"]). The Shell renders it when the path
 * matches, else derives a trail from the nav structure. Keying by path avoids
 * a stale crumb flashing after navigation. */
interface BreadcrumbState {
  forPath: string | null;
  trail: Crumb[];
  set: (forPath: string, trail: Crumb[]) => void;
}

export const useBreadcrumb = create<BreadcrumbState>((set) => ({
  forPath: null,
  trail: [],
  set: (forPath, trail) => set({ forPath, trail }),
}));

/** Publish a breadcrumb trail for the current route from a detail screen. */
export function useSetBreadcrumb(trail: Crumb[]): void {
  const set = useBreadcrumb((s) => s.set);
  const { pathname } = useLocation();
  const key = JSON.stringify(trail);
  useEffect(() => {
    set(pathname, trail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, set, key]);
}
