import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
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
  items: MenuLeaf[];
}

// Sale / Products / Sales history moved to the bottom tab bar — everything
// else the old drawer listed lives here instead, one tap from any tab.
const GROUPS: MenuGroup[] = [
  {
    labelKey: 'drawer.group.pos',
    icon: 'cart-outline',
    items: [
      { labelKey: 'drawer.item.cashRegister', icon: 'wallet-outline', route: '/shift' },
      { labelKey: 'drawer.item.heldSales', icon: 'pause-circle-outline', route: '/held-sales' },
      { labelKey: 'drawer.item.heldSalesHistory', icon: 'archive-outline', route: '/held-sales-history' },
    ],
  },
  {
    labelKey: 'drawer.group.catalog',
    icon: 'cube-outline',
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
    items: [
      { labelKey: 'drawer.item.suppliers', icon: 'boat-outline', route: '/suppliers' },
      { labelKey: 'drawer.item.purchaseOrders', icon: 'clipboard-outline', route: '/purchase-orders' },
    ],
  },
  {
    labelKey: 'drawer.group.customers',
    icon: 'people-outline',
    items: [
      { labelKey: 'drawer.item.customers', icon: 'people-outline', route: '/customers' },
      { labelKey: 'drawer.item.giftCards', icon: 'card-outline', route: '/gift-cards' },
    ],
  },
  {
    labelKey: 'drawer.group.management',
    icon: 'settings-outline',
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

// Same inline-style-driven theming as the old drawer content (see its
// removed NOTE comment) — className-based colors on this screen didn't
// reliably repaint when colorScheme flips at runtime.
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

  // Restrictions only ever apply to Cashier accounts (see staff.tsx's
  // permissions editor) — an Admin/SuperAdmin's own `user.restrict*` fields
  // are always false, so this filter is a no-op for them.
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surface }}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: colors.primary }} className="px-5 pb-6 pt-6">
          <View className="flex-row items-start justify-between">
            <View style={{ width: 40, height: 40 }} className="items-center justify-center overflow-hidden rounded-xl bg-white">
              <Image
                source={require('../../../../assets/images/android-icon-foreground.png')}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
              />
            </View>
            <Pressable
              onPress={onLogout}
              hitSlop={8}
              accessibilityLabel={t('drawer.logout')}
              className="h-8 w-8 items-center justify-center rounded-full bg-white/15 active:bg-white/25">
              <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text className="mt-2 text-sm font-semibold text-white">{user?.name}</Text>
          <Text className="text-xs text-white/80">{locationName ?? t('drawer.noLocation')}</Text>
        </View>

        <View style={{ backgroundColor: colors.surface }} className="py-2">
          {visibleGroups.map((group) => {
            const open = openGroup === group.labelKey;
            return (
              <View key={group.labelKey}>
                <Pressable onPress={() => toggleGroup(group.labelKey)} className="flex-row items-center gap-3 px-4 py-3">
                  <Ionicons name={group.icon} size={20} color={colors.icon} />
                  <Text style={{ color: colors.textPrimary }} className="flex-1 text-sm font-bold">
                    {t(group.labelKey)}
                  </Text>
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.iconMuted} />
                </Pressable>
                {open
                  ? group.items.map((item) => (
                      <MenuRow
                        key={item.labelKey}
                        labelKey={item.labelKey}
                        icon={item.icon}
                        active={isActive(item.route)}
                        onPress={() => go(item)}
                      />
                    ))
                  : null}
              </View>
            );
          })}
        </View>

        <View style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }} className="gap-1 px-4 py-3">
          <Text style={{ color: colors.textSecondary }} className="mb-1 text-xs font-bold uppercase tracking-wide">
            {t('drawer.settings')}
          </Text>

          <View className="flex-row items-center justify-between py-2">
            <Text style={{ color: colors.textPrimary }} className="text-sm font-semibold">
              {t('drawer.darkMode')}
            </Text>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={(value) => setThemePreference(value ? 'dark' : 'light')}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2">
            <Text style={{ color: colors.textPrimary }} className="text-sm font-semibold">
              {t('drawer.language')}
            </Text>
            <View className="flex-row gap-2">
              {LANGUAGES.map((lang) => {
                const active = language === lang.value;
                return (
                  <Pressable
                    key={lang.value}
                    onPress={() => setLanguage(lang.value)}
                    style={{
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.background,
                    }}
                    className="rounded-full border px-3 py-1">
                    <Text style={{ color: active ? '#FFFFFF' : colors.textSecondary }} className="text-xs font-semibold">
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable onPress={() => router.push('/change-password' as never)} className="flex-row items-center gap-3 py-2.5">
            <Ionicons name="key-outline" size={18} color={colors.icon} />
            <Text style={{ color: colors.textPrimary }} className="text-sm font-semibold">
              {t('drawer.changePassword')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  labelKey,
  icon,
  active,
  onPress,
}: {
  labelKey: Parameters<ReturnType<typeof useTranslation>['t']>[0];
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? `${colors.accentBlue}26` : 'transparent' }}
      className="flex-row items-center gap-3 py-3 pl-10 pr-4">
      <Ionicons name={icon} size={18} color={active ? colors.primary : colors.icon} />
      <Text style={{ color: active ? colors.primary : colors.textPrimary }} className="text-sm font-semibold">
        {t(labelKey)}
      </Text>
    </Pressable>
  );
}
