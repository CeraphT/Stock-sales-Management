import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTranslation } from '@/lib/i18n/useTranslation';
import type { StockHealth } from '@/lib/local/dashboardQueries';

const SIZE = 120;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENTS: { key: keyof StockHealth; color: string; labelKey: 'stockHealth.inStock' | 'stockHealth.lowStock' | 'stockHealth.outOfStock' }[] = [
  { key: 'inStock', color: '#059669', labelKey: 'stockHealth.inStock' },
  { key: 'lowStock', color: '#D97706', labelKey: 'stockHealth.lowStock' },
  { key: 'outOfStock', color: '#DC2626', labelKey: 'stockHealth.outOfStock' },
];

export function StockHealthDonut({ health }: { health: StockHealth }) {
  const { t } = useTranslation();
  const total = health.inStock + health.lowStock + health.outOfStock;
  let offsetAccumulated = 0;

  return (
    <View className="flex-row items-center gap-5">
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke="#E3E7E5" strokeWidth={STROKE} fill="none" />
          {total > 0
            ? SEGMENTS.map((seg) => {
                const value = health[seg.key];
                if (value === 0) return null;
                const fraction = value / total;
                const dash = fraction * CIRCUMFERENCE;
                const circle = (
                  <Circle
                    key={seg.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke={seg.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                    strokeDashoffset={-offsetAccumulated}
                    strokeLinecap="butt"
                    fill="none"
                    rotation="-90"
                    origin={`${SIZE / 2}, ${SIZE / 2}`}
                  />
                );
                offsetAccumulated += dash;
                return circle;
              })
            : null}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-2xl font-bold text-text-primary">{total}</Text>
          <Text className="text-[10px] text-text-secondary">{t('stockHealth.productsUnit')}</Text>
        </View>
      </View>

      <View className="gap-2">
        {SEGMENTS.map((seg) => (
          <View key={seg.key} className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <Text className="text-xs text-text-secondary">
              {t(seg.labelKey)} ({health[seg.key]})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
