import { ActivityIndicator, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useSyncStatus } from '@/lib/sync/syncStatus';
import { useThemeColors } from '@/lib/theme/colors';

/** Floating pill (bottom-centre, never blocks touches) shown while the initial sync pulls the business's data
 * (can take a while on a fresh device or right after entering a company), so
 * screens that are still empty don't look broken. */
export function SyncingBar() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const syncing = useSyncStatus((s) => s.initialSyncing);
  if (!syncing) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 84, alignItems: 'center' }}>
      <View
        className="flex-row items-center gap-2 rounded-full px-4 py-2"
        style={{ backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
          {t('sync.initialSyncing')}
        </Text>
      </View>
    </View>
  );
}
