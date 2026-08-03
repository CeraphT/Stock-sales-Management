import { Fragment } from 'react';
import { Text, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { formatCompactNumber } from '@/lib/format';
import type { DailyRevenuePoint } from '@/lib/local/dashboardQueries';
import { useThemeColors } from '@/lib/theme/colors';

const LABEL_AREA_HEIGHT = 16;
const BAR_AREA_HEIGHT = 94;
const CHART_HEIGHT = LABEL_AREA_HEIGHT + BAR_AREA_HEIGHT;
const BAR_WIDTH = 28;
const GAP = 14;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RevenueTrendChart({ points }: { points: DailyRevenuePoint[] }) {
  const colors = useThemeColors();
  const max = Math.max(...points.map((p) => p.total), 1);
  const width = points.length * (BAR_WIDTH + GAP);
  const columnWidth = BAR_WIDTH + GAP;

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        {points.map((p, i) => {
          const barHeight = p.total > 0 ? Math.max((p.total / max) * (BAR_AREA_HEIGHT - 8), 4) : 0;
          const x = i * columnWidth + GAP / 2;
          const y = LABEL_AREA_HEIGHT + BAR_AREA_HEIGHT - barHeight;
          const centerX = x + BAR_WIDTH / 2;
          return (
            <Fragment key={p.date}>
              {p.total > 0 ? (
                <SvgText x={centerX} y={LABEL_AREA_HEIGHT - 4} fontSize={9} fontWeight="600" fill={colors.textSecondary} textAnchor="middle">
                  {formatCompactNumber(p.total)}
                </SvgText>
              ) : null}
              <Rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={5} fill={colors.primary} />
            </Fragment>
          );
        })}
      </Svg>
      <View className="flex-row" style={{ width }}>
        {points.map((p) => (
          <Text key={p.date} className="text-center text-[10px] text-text-secondary" style={{ width: columnWidth }}>
            {WEEKDAY_LABELS[new Date(`${p.date}T00:00:00Z`).getUTCDay()]}
          </Text>
        ))}
      </View>
    </View>
  );
}
