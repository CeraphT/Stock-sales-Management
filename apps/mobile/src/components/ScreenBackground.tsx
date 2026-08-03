import { useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useThemeColors } from '@/lib/theme/colors';

const RING_STEP = 48;

/** A near-invisible blueprint texture, absolutely filled behind a screen's
 * own content — concentric rings + a crosshair through the screen's center,
 * echoing the concentric-circle/crosshair construction lines behind the
 * app's own logo mark (assets/images/android-icon-background.png). Render
 * as the FIRST child of a screen's outer (non-scrolling) container, e.g.:
 *   <SafeAreaView className="flex-1 bg-background">
 *     <ScreenBackground />
 *     ...rest of the screen
 * Deliberately not placed inside a ScrollView's content — it would scroll
 * away with it instead of staying fixed behind the whole screen.
 *
 * Built from plain `Circle`/`Line` elements rather than an SVG `<Pattern>`
 * fill — react-native-svg's `<Pattern>` renders blank under React Native's
 * Fabric (New Architecture), which this app runs on (confirmed on-device).
 * Circle/Line don't hit that bug. */
export function ScreenBackground() {
  const colors = useThemeColors();
  const lineColor = colors.gridLine;
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));

  const rings = [];
  for (let r = RING_STEP; r <= maxRadius; r += RING_STEP) {
    rings.push(<Circle key={r} cx={cx} cy={cy} r={r} stroke={lineColor} strokeWidth={1} fill="none" />);
  }

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Line x1={cx} y1={0} x2={cx} y2={height} stroke={lineColor} strokeWidth={1} />
      <Line x1={0} y1={cy} x2={width} y2={cy} stroke={lineColor} strokeWidth={1} />
      <Line x1={cx - maxRadius} y1={cy - maxRadius} x2={cx + maxRadius} y2={cy + maxRadius} stroke={lineColor} strokeWidth={1} />
      <Line x1={cx - maxRadius} y1={cy + maxRadius} x2={cx + maxRadius} y2={cy - maxRadius} stroke={lineColor} strokeWidth={1} />
      {rings}
    </Svg>
  );
}
