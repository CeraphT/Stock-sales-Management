import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exitCompany, useImpersonation } from '@/lib/auth/impersonation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

/** Amber bar across the top of the app while a SuperAdmin operates inside a
 * company (M8), so it's never ambiguous whose data is on screen — mobile twin of
 * apps/web/src/components/ImpersonationBanner.tsx. "Quitter" restores the
 * SuperAdmin session; it also leaves automatically when the ~2 h impersonation
 * token expires (there's no refresh token to extend it). */
export function ImpersonationBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const active = useImpersonation((s) => s.active);
  const companyName = useImpersonation((s) => s.companyName);
  const expiresAt = useImpersonation((s) => s.expiresAt);
  const [leaving, setLeaving] = useState(false);

  const leave = async (force = false) => {
    setLeaving(true);
    try {
      const left = await exitCompany({ force });
      if (left) {
        router.replace('/company-picker' as never);
        return;
      }
      showAlert(t('superAdmin.unsyncedTitle'), t('superAdmin.unsyncedMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('superAdmin.leaveAnyway'), style: 'destructive', onPress: () => leave(true) },
      ]);
    } finally {
      setLeaving(false);
    }
  };

  // Auto-exit at token expiry (checked every 30 s and once on mount).
  useEffect(() => {
    if (!active || !expiresAt) return;
    const check = () => {
      if (Date.parse(expiresAt) <= Date.now()) {
        toast(t('superAdmin.expired'), 'info');
        exitCompany({ force: true }).then(() => router.replace('/company-picker' as never));
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [active, expiresAt, t]);

  if (!active) return null;

  return (
    <View style={{ backgroundColor: '#D97706', paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 py-2">
        <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
        <Text className="flex-1 text-sm text-white" numberOfLines={1}>
          {t('superAdmin.managing')} <Text className="font-bold">{companyName}</Text>
        </Text>
        <Pressable
          onPress={() => leave()}
          disabled={leaving}
          hitSlop={6}
          className="rounded-full px-3 py-1.5 active:opacity-80"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
          {leaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-xs font-bold text-white">{t('superAdmin.exit')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}
