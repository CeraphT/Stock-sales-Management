import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

/** Shown over any company-scoped screen (sales history, catalog, POS, …) while
 * the session has no company — i.e. a SuperAdmin who hasn't entered one yet.
 * Those screens all bail out early without a companyId, which used to leave
 * them spinning forever; this explains why and offers the way in. Rendered by
 * (app)/_layout as an absolute overlay so the navigation underneath stays
 * mounted (the tablet nav rail remains usable). */
export function NoCompanyNotice() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="bg-background">
      <ScreenBackground />
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full items-center rounded-card border border-border bg-surface p-6" style={{ maxWidth: 460 }}>
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Ionicons name="business-outline" size={24} color={colors.primary} />
          </View>
          <Text className="mt-3 text-center text-lg font-bold text-text-primary">{t('dashboard.noCompanyTitle')}</Text>
          <Text className="mt-1 text-center text-sm text-text-secondary">{t('noCompany.screenMsg')}</Text>
          <Pressable
            onPress={() => router.push('/company-picker' as never)}
            className="mt-5 w-full flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 active:opacity-80">
            <Ionicons name="swap-horizontal-outline" size={16} color="#FFFFFF" />
            <Text className="text-sm font-bold text-white">{t('superAdmin.pickerTitle')}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/dashboard')} className="mt-2 w-full items-center rounded-xl px-4 py-3 active:opacity-70">
            <Text className="text-sm font-semibold text-text-secondary">{t('noCompany.backHome')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
