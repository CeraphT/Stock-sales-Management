import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

// The 5 highest-traffic screens live here as bottom tabs — everything else
// (Suppliers, Customers, Gift Cards, Reports, Settings, ...) is one tap away
// under More, reached via router.push like every other secondary screen.
export default function TabsLayout() {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const icon = (name: IconName, focusedName: IconName) =>
    ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
      <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: t('tabs.dashboard'), tabBarIcon: icon('home-outline', 'home') }}
      />
      <Tabs.Screen name="pos" options={{ title: t('tabs.pos'), tabBarIcon: icon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen
        name="catalog"
        options={{ title: t('tabs.catalog'), tabBarIcon: icon('cube-outline', 'cube') }}
      />
      <Tabs.Screen
        name="sales-history"
        options={{ title: t('tabs.sales'), tabBarIcon: icon('time-outline', 'time') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('tabs.more'), tabBarIcon: icon('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle') }}
      />
    </Tabs>
  );
}
