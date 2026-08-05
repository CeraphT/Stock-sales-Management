import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
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

interface MenuLeaf {
  labelKey: Parameters<ReturnType<typeof useTranslation>['t']>[0];
  icon: IconName;
  route?: string;
}

interface MenuGroup {
  labelKey: Parameters<ReturnType<typeof useTranslation>['t']>[0];
  icon: IconName;
  tint: 'primary' | 'accentBlue' | 'accentOrange' | 'accentPurple' | 'success';
  items: MenuLeaf[];
}

const GROUPS: MenuGroup[] = [
  {
    labelKey: 'drawer.group.pos',
    icon: 'cart-outline',
    tint: 'primary',
    items: [
      { labelKey: 'drawer.item.cashRegister', icon: 'wallet-outline', route: '/shift' },
      { labelKey: 'drawer.item.heldSales', icon: 'pause-circle-outline', route: '/held-sales' },
      { labelKey: 'drawer.item.heldSalesHistory', icon: 'archive-outline', route: '/held-sales-history' },
    ],
  },
  {
    labelKey: 'drawer.group.catalog',
    icon: 'cube-outline',
    tint: 'accentBlue',
    items: [
      { labelKey: 'drawer.item.categories', icon: 'pricetag-outline', route: '/categories' },
      { labelKey: 'drawer.item.archive', icon: 'archive-outline', route: '/archived-products' },
      { labelKey: 'drawer.item.bulkStock', icon: 'cloud-upload-outline', route: '/bulk-stock-register' },
      { labelKey: 'drawer.item.services', icon: 'medkit-outline', route: '/services' },
    ],
  },
  {
    labelKey: 'drawer.group.purchasing',
    icon: 'boat-outline',
    tint: 'accentOrange',
    items: [
      { labelKey: 'drawer.item.suppliers', icon: 'boat-outline', route: '/suppliers' },
      { labelKey: 'drawer.item.purchaseOrders', icon: 'clipboard-outline', route: '/purchase-orders' },
    ],
  },
  {
    labelKey: 'drawer.group.customers',
    icon: 'people-outline',
    tint: 'accentPurple',
    items: [
      { labelKey: 'drawer.item.customers', icon: 'people-outline', route: '/customers' },
      { labelKey: 'drawer.item.giftCards', icon: 'card-outline', route: '/gift-cards' },
    ],
  },
  {
    labelKey: 'drawer.group.management',
    icon: 'settings-outline',
    tint: 'success',
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

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
];

// Inline-style-driven theming (className colors don't reliably repaint when
// colorScheme flips at runtime on this screen). Tints add an alpha suffix to
// the 6-digit hex (RN supports 8-digit hex).
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const roleLabel = user?.role === UserRole.SuperAdmin ? 'Super admin' : user?.role === UserRole.CompanyAdmin ? 'Admin' : 'Cashier';
  const initial = (user?.name?.trim()[0] ?? '•').toUpperCase();

  const visibleGroups = GROUPS.filter((group) => {
    if (group.labelKey === 'drawer.group.catalog' && user?.restrictCatalog) return false;
    if (group.labelKey === 'drawer.group.purchasing' && user?.restrictPurchasing) return false;
    if (group.labelKey === 'drawer.group.customers' && user?.restrictCustomers) return false;
    return true;
  }).map((group) =>
    group.labelKey === 'drawer.group.management' && user?.restrictReportsAndFullSales
      ? { ...group, items: group.items.filter((item) => item.labelKey !== 'drawer.item.reports') }
      : group,
  );

  const toggleGroup = (label: string) => setOpenGroup((prev) => (prev === label ? null : label));

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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top']}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={{ backgroundColor: colors.primary, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }} className="px-5 pb-7 pt-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: '#FFFFFF33' }}>
                <Text className="text-xl font-black text-white">{initial}</Text>
              </View>
              <View>
                <Text className="text-base font-bold text-white">{user?.name ?? '—'}</Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#FFFFFF2E' }}>
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

        {/* Grouped menu cards */}
        <View className="mt-4">
          {visibleGroups.map((group) => {
            const open = openGroup === group.labelKey;
            const tint = colors[group.tint];
            return (
              <View
                key={group.labelKey}
                className="mx-4 mb-3 overflow-hidden rounded-2xl border"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                <Pressable onPress={() => toggleGroup(group.labelKey)} className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70">
                  <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: tint + '22' }}>
                    <Ionicons name={group.icon} size={18} color={tint} />
                  </View>
                  <Text className="flex-1 text-sm font-bold" style={{ color: colors.textPrimary }}>
                    {t(group.labelKey)}
                  </Text>
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.iconMuted} />
                </Pressable>
                {open ? (
                  <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
                    {group.items.map((item) => {
                      const active = isActive(item.route);
                      return (
                        <Pressable
                          key={item.labelKey}
                          onPress={() => go(item)}
                          className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                          style={{ backgroundColor: active ? colors.primary + '14' : 'transparent' }}>
                          <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colors.background }}>
                            <Ionicons name={item.icon} size={16} color={active ? colors.primary : colors.iconMuted} />
                          </View>
                          <Text className="flex-1 text-sm font-medium" style={{ color: active ? colors.primary : colors.textPrimary }}>
                            {t(item.labelKey)}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.iconMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Settings */}
        <Text className="mx-6 mb-2 mt-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
          {t('drawer.settings')}
        </Text>
        <View className="mx-4 overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <SettingRow>
            <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colors.accentBlue + '22' }}>
              <Ionicons name={colorScheme === 'dark' ? 'moon' : 'moon-outline'} size={16} color={colors.accentBlue} />
            </View>
            <Text className="flex-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
              {t('drawer.darkMode')}
            </Text>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={(value) => setThemePreference(value ? 'dark' : 'light')}
              trackColor={{ true: colors.primary }}
            />
          </SettingRow>
          <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }} />
          <SettingRow>
            <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colors.accentPurple + '22' }}>
              <Ionicons name="language-outline" size={16} color={colors.accentPurple} />
            </View>
            <Text className="flex-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
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
          <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }} />
          <Pressable onPress={() => router.push('/change-password' as never)} className="flex-row items-center gap-3 px-4 py-3 active:opacity-70">
            <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colors.accentAmber + '22' }}>
              <Ionicons name="key-outline" size={16} color={colors.accentAmber} />
            </View>
            <Text className="flex-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
              {t('drawer.changePassword')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.iconMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ children }: { children: ReactNode }) {
  return <View className="flex-row items-center gap-3 px-4 py-3">{children}</View>;
}
