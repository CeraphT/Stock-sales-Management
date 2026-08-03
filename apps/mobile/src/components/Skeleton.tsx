import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

/** Pulsing placeholder block — swap in for spinners on any screen where we
 * already know the rough shape of the content that's about to arrive.
 * Uses React Native's built-in Animated API (not react-native-reanimated) —
 * no extra native module, nothing to get out of sync with the native build. */
export function Skeleton({ width = '100%', height = 14, radius = 8 }: SkeletonProps) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={{ width, height, borderRadius: radius, backgroundColor: colors.border, opacity }} />;
}

/** One row matching the common icon + title/subtitle + trailing-amount shape
 * used across Sales History, Held Sales, Purchase Orders, etc. */
export function SkeletonListItem() {
  return (
    <View className="flex-row items-center gap-3 border-b border-border px-5 py-3.5">
      <Skeleton width={40} height={40} radius={20} />
      <View className="flex-1 gap-2">
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={56} height={13} />
    </View>
  );
}

export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

/** Header block + a few stacked card placeholders — matches the general
 * layout of the app's detail screens (Sale/Product/Customer/PO detail, My
 * Business) closely enough to feel like a preview, not a generic filler. */
export function SkeletonDetail() {
  return (
    <View className="gap-5 p-5">
      <View className="gap-2">
        <Skeleton width="55%" height={22} />
        <Skeleton width="30%" height={13} />
      </View>
      <Skeleton height={64} radius={16} />
      <Skeleton height={64} radius={16} />
      <Skeleton height={64} radius={16} />
    </View>
  );
}
