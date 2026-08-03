import { useColorScheme } from "nativewind";

import { resolveThemeColors, type ThemeColors } from "@stockflow/core/theme/colors";

export type { ThemeColors };

export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return resolveThemeColors(colorScheme);
}
