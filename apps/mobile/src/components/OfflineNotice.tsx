import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

/** Amber strip shown when a screen is displaying the local mirror because the
 * server couldn't be reached (see useLocalFirst). `message` overrides the
 * default "data from the last sync" wording. */
export function OfflineNotice({ visible, message }: { visible: boolean; message?: string }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  if (!visible) return null;
  return (
    <View className="flex-row items-center gap-2 border-b border-border px-5 py-2.5" style={{ backgroundColor: colors.accentAmber + '1A' }}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.accentAmber} />
      <Text className="flex-1 text-xs font-semibold" style={{ color: colors.accentAmber }}>
        {message ?? t('offline.cached')}
      </Text>
    </View>
  );
}
