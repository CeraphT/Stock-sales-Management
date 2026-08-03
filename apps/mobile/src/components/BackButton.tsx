import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

/** Standard top-left back control for every secondary screen's header — a
 * circular icon button (not a plain "← Back" text link), consistent with
 * the chevron-back icon button already used on the pre-auth screens. */
export function BackButton() {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      accessibilityLabel="Back"
      className="h-9 w-9 items-center justify-center rounded-full bg-background active:opacity-70">
      <Ionicons name="chevron-back" size={20} color={colors.icon} />
    </Pressable>
  );
}
