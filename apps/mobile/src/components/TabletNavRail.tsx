import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;
type LabelKey = Parameters<ReturnType<typeof useTranslation>['t']>[0];

interface RailItem {
  labelKey: LabelKey;
  icon: IconName;
  activeIcon: IconName;
  route: string;
  /** Extra routes that should also mark this item active (its sub-screens). */
  match?: string[];
}

// The primary sections — mirrors the phone bottom tabs, shown as a persistent
// left rail on tablets so the app reads like the desktop client.
const ITEMS: RailItem[] = [
  { labelKey: 'tabs.dashboard', icon: 'home-outline', activeIcon: 'home', route: '/dashboard', match: ['/alerts', '/demand-forecast', '/dead-stock'] },
  { labelKey: 'tabs.pos', icon: 'add-circle-outline', activeIcon: 'add-circle', route: '/pos', match: ['/checkout', '/scanner'] },
  { labelKey: 'tabs.catalog', icon: 'cube-outline', activeIcon: 'cube', route: '/catalog', match: ['/product-detail', '/add-product', '/stock-count', '/print-labels'] },
  { labelKey: 'tabs.sales', icon: 'time-outline', activeIcon: 'time', route: '/sales-history', match: ['/sale-detail'] },
  { labelKey: 'tabs.more', icon: 'ellipsis-horizontal-circle-outline', activeIcon: 'ellipsis-horizontal-circle', route: '/more' },
];

/** Fixed-width vertical navigation rail for tablet-size screens. Lives in the
 * (app) layout so it persists across every screen (tab screens AND pushed
 * detail screens), giving the desktop-style shell. */
export function TabletNavRail() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const pathname = usePathname();

  const isActive = (item: RailItem) =>
    pathname === item.route || (item.match ?? []).some((m) => pathname.startsWith(m));

  return (
    <View
      style={{ width: 84, backgroundColor: colors.surface, borderRightColor: colors.border, borderRightWidth: 1 }}
      className="items-center pt-14">
      <View className="mb-6 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: colors.primary }}>
        <Ionicons name="cube" size={20} color="#FFFFFF" />
      </View>
      {ITEMS.map((item) => {
        const active = isActive(item);
        return (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route as never)}
            className="mb-2 w-full items-center gap-1 py-2.5 active:opacity-70"
            style={{ backgroundColor: active ? colors.primary + '14' : 'transparent' }}>
            <Ionicons name={active ? item.activeIcon : item.icon} size={24} color={active ? colors.primary : colors.iconMuted} />
            <Text numberOfLines={1} className="text-[10px] font-semibold" style={{ color: active ? colors.primary : colors.textSecondary }}>
              {t(item.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
