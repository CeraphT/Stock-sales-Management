import Constants from 'expo-constants';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Sponsor credited in the footer (exact spelling). */
export const SPONSOR = 'mfSPACE.lu';

/** "v0.2.0": the version shown to people (the build commit stays in
 * app.config.js extra / the device heartbeat, not on screen). */
export const APP_VERSION_LABEL = `v${Constants.expoConfig?.version ?? '?'}`;

/** Thin strip at the very bottom of the app (below the tab bar), on every
 * screen, showing the build and the sponsor. Never covers content. */
export function AppVersionFooter() {
  const insets = useSafeAreaInsets();
  return (
    <View className="items-center bg-background" style={{ paddingBottom: insets.bottom, paddingTop: 2 }} pointerEvents="none">
      <Text className="text-[10px] text-text-secondary" style={{ opacity: 0.7 }} numberOfLines={1}>
        StockFlow Android {APP_VERSION_LABEL} · © {SPONSOR}
      </Text>
    </View>
  );
}
