/** Hex values for native props that can't take a Tailwind className
 * (Ionicons' `color`, `placeholderTextColor`, etc.) — kept in lockstep
 * with the CSS variables in global.css so icons/placeholders match
 * whatever `bg-*`/`text-*` classNames resolve to on the same screen.
 *
 * Just the palette lives here — resolving *which* one is active
 * (`useThemeColors()`) is platform-specific (NativeWind's `colorScheme` on
 * mobile, a CSS-class/media-query read on desktop) and lives in each app. */
export const LIGHT = {
  primary: "#4F46E5",
  primaryDark: "#818CF8",
  icon: "#374151",
  iconMuted: "#9CA3AF",
  placeholder: "#9CA3AF",
  textPrimary: "#1F2937",
  textSecondary: "#6B7280",
  white: "#FFFFFF",
  error: "#DC2626",
  success: "#059669",
  surface: "#FFFFFF",
  background: "#F5F8F7",
  border: "#E3E7E5",
  accentBlue: "#2563EB",
  accentPurple: "#7C3AED",
  accentAmber: "#D97706",
  accentOrange: "#EA580C",
  gridLine: "rgba(30, 41, 59, 0.045)",
};

export const DARK = {
  primary: "#818CF8",
  primaryDark: "#4F46E5",
  icon: "#D1D5DB",
  iconMuted: "#6B7280",
  placeholder: "#6B7280",
  textPrimary: "#F3F4F6",
  textSecondary: "#9CA3AF",
  white: "#FFFFFF",
  error: "#F87171",
  success: "#34D399",
  surface: "#1E293B",
  background: "#0F1420",
  border: "#334155",
  accentBlue: "#60A5FA",
  accentPurple: "#C084FC",
  accentAmber: "#FBBF24",
  accentOrange: "#FB923C",
  gridLine: "rgba(255, 255, 255, 0.045)",
};

export type ThemeColors = typeof LIGHT;

export function resolveThemeColors(colorScheme: "light" | "dark" | null | undefined): ThemeColors {
  return colorScheme === "dark" ? DARK : LIGHT;
}
