import { colorScheme } from "nativewind";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "theme_preference";

interface ThemeState {
  preference: ThemePreference;
  hasHydrated: boolean;
  setPreference: (value: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

/** Restores system-follow mode. NativeWind's own `colorScheme.set("system")`
 * resolves (on this RN version) to `Appearance.setColorScheme("unspecified")`,
 * which was confirmed on-device to force light mode instead of actually
 * clearing the override (reproduced with a full `pm clear` fresh-install
 * test under a confirmed-dark OS setting). Calling the stable, documented
 * `Appearance.setColorScheme(null)` directly does clear it correctly. */
function applySystem() {
  Appearance.setColorScheme("unspecified" as never);
}

/** Persisted light/dark/system preference, backed by expo-secure-store
 * (same pattern as the auth session) — the actual dark/light styling comes
 * from NativeWind's own `colorScheme.set()`, which drives every `dark:`
 * className app-wide via the CSS variables in global.css. This store just
 * remembers the user's choice across restarts and applies it on boot. */
export const useThemeStore = create<ThemeState>()((set) => ({
  preference: "system",
  hasHydrated: false,
  setPreference: (value) => {
    if (value === "system") {
      applySystem();
    } else {
      colorScheme.set(value);
    }
    SecureStore.setItemAsync(KEY, value).catch(() => {});
    set({ preference: value });
  },
  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(KEY);
    const preference: ThemePreference = stored === "light" || stored === "dark" ? stored : "system";
    if (preference === "system") {
      applySystem();
    } else {
      colorScheme.set(preference);
    }
    set({ preference, hasHydrated: true });
  },
}));
