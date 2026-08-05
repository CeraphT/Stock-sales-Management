import { Text, View } from 'react-native';

import type { StockStatus } from '@stockflow/core/api/enums';

// Same tones as desktop's StockBadge (apps/desktop/src/components/StockBadge.tsx).
// The label is passed in (mobile's i18n is key-based, so the caller supplies the
// translated text); defaults are the plain English labels already used in-app.
const MAP: Record<StockStatus, { label: string; badge: string; text: string }> = {
  in_stock: { label: 'In stock', badge: 'bg-success/15', text: 'text-success' },
  low_stock: { label: 'Low stock', badge: 'bg-accent-amber/15', text: 'text-accent-amber' },
  out_of_stock: { label: 'Out of stock', badge: 'bg-error/15', text: 'text-error' },
};

export function StockBadge({ status, label }: { status: StockStatus; label?: string }) {
  const m = MAP[status];
  return (
    <View className={`self-start rounded-lg px-2 py-0.5 ${m.badge}`}>
      <Text className={`text-xs font-semibold ${m.text}`}>{label ?? m.label}</Text>
    </View>
  );
}
