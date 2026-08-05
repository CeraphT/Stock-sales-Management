import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export type StatColor = 'primary' | 'green' | 'amber' | 'red' | 'blue' | 'orange' | 'neutral';

// Tone → icon-tile background + value text colour. Mirrors desktop's StatCard
// (apps/desktop/src/components/StatCard.tsx). NativeWind resolves the `/15`
// alpha against the CSS-variable palette.
const TONES: Record<StatColor, { badge: string; value: string }> = {
  primary: { badge: 'bg-primary/15', value: 'text-text-primary' },
  green: { badge: 'bg-success/15', value: 'text-success' },
  amber: { badge: 'bg-accent-amber/15', value: 'text-accent-amber' },
  red: { badge: 'bg-error/15', value: 'text-error' },
  blue: { badge: 'bg-accent-blue/15', value: 'text-text-primary' },
  orange: { badge: 'bg-accent-orange/15', value: 'text-accent-orange' },
  neutral: { badge: 'bg-text-secondary/15', value: 'text-text-primary' },
};

/** Reusable dashboard/report stat tile — icon on top, uppercase label, then the
 * value on its own line so long amounts never clip. Pressable when `onPress` is
 * given (the mobile analogue of desktop's deep-link `to`). */
export function StatCard({
  icon,
  label,
  value,
  color = 'neutral',
  hint,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: StatColor;
  hint?: string;
  onPress?: () => void;
}) {
  const tone = TONES[color];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`rounded-card border border-border bg-surface p-4 ${onPress ? 'active:opacity-80' : ''}`}>
      <View className={`h-9 w-9 items-center justify-center rounded-lg ${tone.badge}`}>{icon}</View>
      <Text numberOfLines={1} className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </Text>
      <Text numberOfLines={1} className={`mt-0.5 text-xl font-extrabold ${tone.value}`}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-text-secondary">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}
