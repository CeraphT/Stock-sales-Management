import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

/** The shared surface primitive — an 18px `rounded-card` panel matching
 * desktop's card (apps/desktop/src/index.css `.rounded-card`). RN can't do the
 * web build's backdrop-blur glass, so this is the opaque approximation. */
export function Card({ children, className = '', ...rest }: ViewProps & { children?: ReactNode; className?: string }) {
  return (
    <View className={`rounded-card border border-border bg-surface p-4 ${className}`} {...rest}>
      {children}
    </View>
  );
}
