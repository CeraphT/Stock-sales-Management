import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { UserRole } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';
import type { Language } from '@/lib/i18n/store';
import { useLanguageStore } from '@/lib/i18n/store';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';
import { useThemeStore } from '@/lib/theme/store';
import { showAlert } from '@/lib/ui/alertStore';

type IconName = keyof typeof Ionicons.glyphMap;
type Tint = 'primary' | 'accentBlue' | 'accentOrange' | 'accentPurple' | 'success';
type LabelKey = Parameters<ReturnType<typeof useTranslation>['t']>[0];

interface MenuLeaf {
  labelKey: LabelKey;
  icon: IconName;
  route?: string;
}
interface MenuGroup {
  labelKey: LabelKey;
  tint: Tint;
  items: MenuLeaf[];
}

const GROUPS: MenuGroup[] = [
  {
    labelKey: 'drawer.group.pos',
    tint: 'primary',
    items: [
      { labelKey: 'drawer.item.cashRegister', icon: 'wallet-outline', route: '/shift' },
      { labelKey: 'drawer.item.heldSales', icon: 'pause-circle-outline', route: '/held-sales' },
      { labelKey: 'drawer.item.heldSalesHistory', icon: 'archive-outline', route: '/held-sales-history' },
    ],
  },
  {
    labelKey: 'drawer.group.catalog',
    tint: 'accentPurple',
    items: [
      { labelKey: 'drawer.item.categories', icon: 'pricetag-outline', route: '/categories' },
      { labelKey: 'drawer.item.archive', icon: 'archive-outline', route: '/archived-products' },
      { labelKey: 'drawer.item.bulkStock', icon: 'cloud-upload-outline', route: '/bulk-stock-register' },
      { labelKey: 'drawer.item.services', icon: 'medkit-outline', route: '/services' },
    ],
  },
  {
    labelKey: 'drawer.group.purchasing',
    tint: 'accentOrange',
    items: [
      { labelKey: 'drawer.item.suppliers', icon: 'boat-outline', route: '/suppliers' },
      { labelKey: 'drawer.item.purchaseOrders', icon: 'clipboard-outline', route: '/purchase-orders' },
    ],
  },
  {
    labelKey: 'drawer.group.customers',
    tint: 'success',
    items: [
      { labelKey: 'drawer.item.customers', icon: 'people-outline', route: '/customers' },
      { labelKey: 'drawer.item.giftCards', icon: 'card-outline', route: '/gift-cards' },
    ],
  },
  {
    labelKey: 'drawer.group.management',
    tint: 'accentBlue',
    items: [
      { labelKey: 'drawer.item.reports', icon: 'bar-chart-outline', route: '/reports' },
      { labelKey: 'drawer.item.inventoryReport', icon: 'cube-outline', route: '/inventory-report' },
      { labelKey: 'drawer.item.taxDeclaration', icon: 'receipt-outline', route: '/tax-declaration' },
      { labelKey: 'drawer.item.printer', icon: 'print-outline', route: '/printer-settings' },
      { labelKey: 'drawer.item.staff', icon: 'people-circle-outline', route: '/staff' },
      { labelKey: 'drawer.item.dataMaintenance', icon: 'shield-checkmark-outline', route: '/data-maintenance' },
      { labelKey: 'drawer.item.myBusiness', icon: 'business-outline', route: '/my-business' },
    ],
  },
];

// Most-reached destinations, shown as big tiles at the top (any that a cashier
// is restricted from are dropped automatically).
const QUICK_ROUTES = ['/shift', '/reports', '/suppliers', '/customers'];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
];

export default function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const locationName = useAuthStore((s) => s.locationName);
  const clear = useAuthStore((s) => s.clear);
  const pathname = usePathname();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [query, setQuery] = useState('');

  const roleLabel = user?.role === UserRole.SuperAdmin ? 'Super admin' : user?.role === UserRole.CompanyAdmin ? 'Admin' : 'Cashier';
  const initial = (user?.name?.trim()[0] ?? '•').toUpperCase();

  const visibleGroups = useMemo(
    () =>
      GROUPS.filter((group) => {
        if (group.labelKey === 'drawer.group.catalog' && user?.restrictCatalog) return false;
        if (group.labelKey === 'drawer.group.purchasing' && user?.restrictPurchasing) return false;
        if (group.labelKey === 'drawer.group.customers' && user?.restrictCustomers) return false;
        return true;
      }).map((group) =>
        group.labelKey === 'drawer.group.management' && user?.restrictReportsAndFullSales
          ? { ...group, items: group.items.filter((item) => item.labelKey !== 'drawer.item.reports') }
          : group,
      ),
    [user],
  );

  // Flattened { item, tint } for quick-access + search.
  const allItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items.map((item) => ({ item, tint: g.tint }))),
    [visibleGroups],
  );
  const quick = QUICK_ROUTES.map((r) => allItems.find((x) => x.item.route === r)).filter(Boolean) as { item: MenuLeaf; tint: Tint }[];

  const q = query.trim().toLowerCase();
  const results = q ? allItems.filter((x) => t(x.item.labelKey).toLowerCase().includes(q)) : [];

  const go = (item: MenuLeaf) => {
    if (!item.route) {
      showAlert(t(item.labelKey), t('drawer.comingSoon'));
      return;
    }
    router.push(item.route as never);
  };
  const onLogout = () => {
    clear();
    router.replace('/');
  };
  const isActive = (route?: string) => !!route && pathname === route;

  const row = (entry: { item: MenuLeaf; tint: Tint }, last: boolean) => {
    const tint = colors[entry.tint];
    const active = isActive(entry.item.route);
    return (
      <Pressable
        key={entry.item.labelKey}
        onPress={() => go(entry.item)}
        className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
        style={{ backgroundColor: active ? colors.primary + '14' : 'transparent', borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }}>
        <View className="h-8 w-8 items-center justify-center rounded-[9px]" style={{ backgroundColor: tint + '22' }}>
          <Ionicons name={entry.item.icon} size={17} color={tint} />
        </View>
        <Text className="flex-1 text-sm" style={{ color: active ? colors.primary : colors.textPrimary }}>
          {t(entry.item.labelKey)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top']}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Accent header */}
        <View style={{ backgroundColor: colors.primary }} className="px-4 pb-5 pt-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-13 w-13 items-center justify-center rounded-2xl" style={{ width: 52, height: 52, backgroundColor: '#FFFFFF38' }}>
                <Text className="text-xl font-black text-white">{initial}</Text>
              </View>
              <View>
                <Text className="text-base font-bold text-white">{user?.name ?? '—'}</Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#FFFFFF33' }}>
                    <Text className="text-[10px] font-bold text-white">{roleLabel}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={12} color="#FFFFFFCC" />
                    <Text className="text-xs text-white/80">{locationName ?? t('drawer.noLocation')}</Text>
                  </View>
                </View>
              </View>
            </View>
            <Pressable
              onPress={onLogout}
              hitSlop={8}
              accessibilityLabel={t('drawer.logout')}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: '#FFFFFF26' }}>
              <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View className="px-4 pt-4">
          {/* Search */}
          <View
            className="mb-4 flex-row items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <Ionicons name="search" size={16} color={colors.iconMuted} />
            <TextInput
              className="flex-1 text-sm"
              style={{ color: colors.textPrimary }}
              placeholder="Search menu"
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.iconMuted} />
              </Pressable>
            ) : null}
          </View>

          {q ? (
            /* Search results */
            <View className="overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              {results.length === 0 ? (
                <Text className="px-4 py-6 text-center text-sm" style={{ color: colors.textSecondary }}>
                  Nothing matches “{query}”.
                </Text>
              ) : (
                results.map((entry, i) => row(entry, i === results.length - 1))
              )}
            </View>
          ) : (
            <>
              {/* Quick access */}
              {quick.length > 0 ? (
                <>
                  <Text className="mb-2 ml-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Quick access
                  </Text>
                  <View className="mb-5 flex-row flex-wrap justify-between">
                    {quick.map(({ item, tint }) => {
                      const c = colors[tint];
                      return (
                        <Pressable
                          key={item.labelKey}
                          onPress={() => go(item)}
                          className="mb-2.5 rounded-2xl border p-3 active:opacity-70"
                          style={{ width: '48.5%', borderColor: colors.border, backgroundColor: colors.surface }}>
                          <View className="h-9 w-9 items-center justify-center rounded-[10px]" style={{ backgroundColor: c + '22' }}>
                            <Ionicons name={item.icon} size={19} color={c} />
                          </View>
                          <Text className="mt-2 text-sm font-semibold" style={{ color: colors.textPrimary }} numberOfLines={1}>
                            {t(item.labelKey)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {/* Grouped list cards */}
              {visibleGroups.map((group) => {
                const tint = colors[group.tint];
                return (
                  <View key={group.labelKey}>
                    <View className="mb-2 ml-0.5 flex-row items-center gap-2">
                      <View className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: tint }} />
                      <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        {t(group.labelKey)}
                      </Text>
                    </View>
                    <View className="mb-4 overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                      {group.items.map((item, i) => row({ item, tint: group.tint }, i === group.items.length - 1))}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Settings */}
          <Text className="mb-2 ml-0.5 mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
            {t('drawer.settings')}
          </Text>
          <View className="overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <SettingRow border>
              <View className="h-8 w-8 items-center justify-center rounded-[9px]" style={{ backgroundColor: colors.accentBlue + '22' }}>
                <Ionicons name={colorScheme === 'dark' ? 'moon' : 'moon-outline'} size={16} color={colors.accentBlue} />
              </View>
              <Text className="flex-1 text-sm" style={{ color: colors.textPrimary }}>
                {t('drawer.darkMode')}
              </Text>
              <Switch
                value={colorScheme === 'dark'}
                onValueChange={(value) => setThemePreference(value ? 'dark' : 'light')}
                trackColor={{ true: colors.primary }}
              />
            </SettingRow>
            <SettingRow border>
              <View className="h-8 w-8 items-center justify-center rounded-[9px]" style={{ backgroundColor: colors.accentPurple + '22' }}>
                <Ionicons name="language-outline" size={16} color={colors.accentPurple} />
              </View>
              <Text className="flex-1 text-sm" style={{ color: colors.textPrimary }}>
                {t('drawer.language')}
              </Text>
              <View className="flex-row gap-1.5">
                {LANGUAGES.map((lang) => {
                  const active = language === lang.value;
                  return (
                    <Pressable
                      key={lang.value}
                      onPress={() => setLanguage(lang.value)}
                      style={{ borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.background }}
                      className="rounded-full border px-3 py-1">
                      <Text style={{ color: active ? '#FFFFFF' : colors.textSecondary }} className="text-xs font-bold">
                        {lang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </SettingRow>
            <Pressable onPress={() => router.push('/change-password' as never)} className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70">
              <View className="h-8 w-8 items-center justify-center rounded-[9px]" style={{ backgroundColor: colors.accentAmber + '22' }}>
                <Ionicons name="key-outline" size={16} color={colors.accentAmber} />
              </View>
              <Text className="flex-1 text-sm" style={{ color: colors.textPrimary }}>
                {t('drawer.changePassword')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ children, border }: { children: ReactNode; border?: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 px-3.5 py-3" style={{ borderBottomColor: colors.border, borderBottomWidth: border ? 0.5 : 0 }}>
      {children}
    </View>
  );
}
