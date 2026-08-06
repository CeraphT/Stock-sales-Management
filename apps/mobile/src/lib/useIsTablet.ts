import { useWindowDimensions } from 'react-native';

/** True on tablet-size screens (≥768dp wide). Drives the responsive layout so
 * ONE APK shows a wide, desktop-style multi-column layout on tablets and the
 * compact single-column layout on phones — no separate tablet build. */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}
