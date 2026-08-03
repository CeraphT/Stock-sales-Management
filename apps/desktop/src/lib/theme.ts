import { create } from "zustand";

export type ThemeMode = "light" | "dark";

const KEY = "pharmastock-theme";

function readInitial(): ThemeMode {
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  set: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readInitial(),
  toggle: () => get().set(get().mode === "dark" ? "light" : "dark"),
  set: (mode) => {
    localStorage.setItem(KEY, mode);
    apply(mode);
    set({ mode });
  },
}));

// Apply the persisted/system theme immediately at module load, before first paint.
apply(useThemeStore.getState().mode);
