import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ScreenBackground } from '@/components/ScreenBackground';
import { SkeletonList } from '@/components/Skeleton';
import { UserRole } from '@/lib/api/enums';
import { superAdminApi } from '@stockflow/core/api/endpoints/superAdmin';
import type { SuperAdminCompanySummary } from '@stockflow/core/api/types/superAdmin';
import { enterCompany, useImpersonation } from '@/lib/auth/impersonation';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';
import { toast } from '@/lib/ui/toastStore';

/** SuperAdmin company picker (M8): lists every business and "enters" one via
 * the impersonation token, so the whole app then runs inside that company.
 * Mirrors the web console's Companies → Enter (apps/web/src/screens/superadmin/Companies.tsx). */
export default function CompanyPickerScreen() {
  const { t, language } = useTranslation();
  // French uses the singular for 0 and 1 ("0 produit"), English only for 1.
  const isSingular = (n: number) => (language === 'fr' ? n < 2 : n === 1);
  const colors = useThemeColors();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === UserRole.SuperAdmin;
  const currentCompanyId = useImpersonation((s) => s.companyId);
  const [companies, setCompanies] = useState<SuperAdminCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [entering, setEntering] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCompanies(await superAdminApi.listCompanies());
    } catch (e) {
      toast(e instanceof Error ? e.message : t('superAdmin.loadFailed'), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) load();
    }, [isSuperAdmin, load]),
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A deactivated business is closed (the API also refuses to impersonate it) —
    // manage it from the web console. `!== false` tolerates an older API.
    const open = companies.filter((c) => c.active !== false);
    const list = q ? open.filter((c) => c.name.toLowerCase().includes(q) || c.uniqueCode.toLowerCase().includes(q)) : open;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search]);

  const onEnter = async (c: SuperAdminCompanySummary) => {
    setEntering(c.id);
    try {
      // The impersonation call is made with the SuperAdmin token, so it must
      // happen before enterCompany swaps the session.
      const resp = await superAdminApi.impersonate(c.id);
      await enterCompany(resp);
      router.replace('/dashboard');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('superAdmin.enterFailed'), 'error');
      setEntering(null);
    }
  };

  if (!isSuperAdmin) {
    // Only reachable by a SuperAdmin; anyone else is sent back.
    return <Redirect href="/dashboard" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('superAdmin.pickerTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text className="mt-2 text-xs text-text-secondary">{t('superAdmin.pickerSubtitle')}</Text>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text-primary"
          placeholder={t('superAdmin.search')}
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={<Text className="mt-10 text-center text-sm text-text-secondary">{t('superAdmin.empty')}</Text>}
          renderItem={({ item }) => {
            const isCurrent = item.id === currentCompanyId;
            const busy = entering === item.id;
            return (
              <Pressable
                disabled={!!entering}
                onPress={() => onEnter(item)}
                className={`flex-row items-center gap-3 rounded-card border bg-surface p-4 active:opacity-80 ${isCurrent ? 'border-primary' : 'border-border'}`}>
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Ionicons name="business-outline" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-text-primary" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-secondary">
                    {item.uniqueCode} · {item.productCount} {t(isSingular(item.productCount) ? 'superAdmin.product' : 'superAdmin.products')} · {item.userCount}{' '}
                    {t(isSingular(item.userCount) ? 'superAdmin.user' : 'superAdmin.users')}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View className="flex-row items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5">
                    <Text className="text-xs font-bold text-primary">{isCurrent ? t('superAdmin.current') : t('superAdmin.enter')}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
