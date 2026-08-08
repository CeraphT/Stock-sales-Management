import { useWindowDimensions } from 'react-native';

/** True on tablet-size screens. Uses Android's own tablet definition — the
 * SMALLEST dimension ≥ 600dp (sw600dp) — rather than current width, so it's
 * correct in both orientations and independent of the device's display-scaling
 * (e.g. the SM-T733 is 752dp wide in portrait, which a width≥768 test wrongly
 * classed as a phone). Drives the desktop-style multi-column layout + nav rail
 * on tablets from ONE APK — no separate tablet build. */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= 600;
}
