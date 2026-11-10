import { Text, View } from 'react-native';

import type { StockStatus } from '@stockflow/core/api/enums';

import { useTranslation } from '@/lib/i18n/useTranslation';

// Same tones as desktop's StockBadge (apps/desktop/src/components/StockBadge.tsx).
// A caller may pass its own label; otherwise the badge shows the stock status
// translated into the app's language.
const MAP = {
  in_stock: { key: 'stockHealth.inStock', badge: 'bg-success/15', text: 'text-success' },
  low_stock: { key: 'stockHealth.lowStock', badge: 'bg-accent-amber/15', text: 'text-accent-amber' },
  out_of_stock: { key: 'stockHealth.outOfStock', badge: 'bg-error/15', text: 'text-error' },
} as const satisfies Record<StockStatus, { key: string; badge: string; text: string }>;

export function StockBadge({ status, label }: { status: StockStatus; label?: string }) {
  const { t } = useTranslation();
  const m = MAP[status];
  return (
    <View className={`self-start rounded-lg px-2 py-0.5 ${m.badge}`}>
      <Text className={`text-xs font-semibold ${m.text}`}>{label ?? t(m.key)}</Text>
    </View>
  );
}
