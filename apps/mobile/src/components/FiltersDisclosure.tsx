import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

/** A "Filters" pill that expands/collapses its children — keeps a list
 * screen's header compact by default (search bar only) while still
 * surfacing that filters exist via the active-state dot, and putting them
 * one tap away instead of buried in a separate modal. */
export function FiltersDisclosure({ active, children }: { active: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const colors = useThemeColors();

  return (
    <View className="mt-3">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className={`flex-row items-center gap-1.5 self-start rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
        <Ionicons name="options-outline" size={14} color={active ? colors.primary : colors.textSecondary} />
        <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-text-secondary'}`}>Filters</Text>
        {active ? <View className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={active ? colors.primary : colors.textSecondary} />
      </Pressable>
      {expanded ? <View className="mt-2 gap-2">{children}</View> : null}
    </View>
  );
}
