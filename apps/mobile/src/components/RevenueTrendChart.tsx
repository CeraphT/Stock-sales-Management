import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { formatCompactNumber } from '@/lib/format';
import type { DailyRevenuePoint } from '@/lib/local/dashboardQueries';
import { useThemeColors } from '@/lib/theme/colors';

const H = 150;
const PAD_TOP = 22; // headroom for the value labels above each point
const PAD_BOTTOM = 8;
const STEP = 46; // horizontal spacing per day
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Smooth line + gradient-area revenue chart — the React Native equivalent of
 * desktop's AreaChart (apps/desktop/src/components/AreaChart.tsx): a cubic line
 * through each day's total with a soft fill underneath, a dot + value on each
 * point, and weekday labels below. */
export function RevenueTrendChart({ points }: { points: DailyRevenuePoint[] }) {
  const colors = useThemeColors();

  if (points.length === 0) {
    return (
      <View style={{ height: H }} className="items-center justify-center">
        <Text className="text-sm text-text-secondary">—</Text>
      </View>
    );
  }

  const width = Math.max(points.length * STEP, STEP);
  const max = Math.max(1, ...points.map((p) => p.total));
  const x = (i: number) => i * STEP + STEP / 2;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const pts = points.map((p, i) => [x(i), y(p.total)] as const);

  // Smooth cubic path (control points at horizontal midpoints), same as desktop.
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    line += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const baseline = H - PAD_BOTTOM;
  const area = `${line} L ${pts[pts.length - 1][0]} ${baseline} L ${pts[0][0]} ${baseline} Z`;

  return (
    <View>
      <Svg width={width} height={H}>
        <Defs>
          <LinearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#revFill)" />
        <Path d={line} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([cx, cy], i) => (
          <Circle key={points[i].date} cx={cx} cy={cy} r={3} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
        ))}
        {points.map((p, i) =>
          p.total > 0 ? (
            <SvgText key={`l-${p.date}`} x={pts[i][0]} y={pts[i][1] - 8} fontSize={9} fontWeight="700" fill={colors.textPrimary} textAnchor="middle">
              {formatCompactNumber(p.total)}
            </SvgText>
          ) : null,
        )}
      </Svg>
      <View className="flex-row" style={{ width }}>
        {points.map((p) => (
          <Text key={p.date} className="text-center text-[10px] text-text-secondary" style={{ width: STEP }}>
            {WEEKDAY_LABELS[new Date(`${p.date}T00:00:00Z`).getUTCDay()]}
          </Text>
        ))}
      </View>
    </View>
  );
}
