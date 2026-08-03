import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { RevenueTrendChart } from '@/components/RevenueTrendChart';
import { Skeleton } from '@/components/Skeleton';
import { StockHealthDonut } from '@/components/StockHealthDonut';
import { dashboardApi } from '@/lib/api/endpoints/dashboard';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { type DashboardStats, type DailyRevenuePoint, getDashboardStats } from '@/lib/local/dashboardQueries';
import { localShiftService } from '@/lib/local/shiftService';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';

type IconName = keyof typeof Ionicons.glyphMap;

// Three tiles, two conditional banners, and two cards (revenue trend +
// stock health) — still a daily at-a-glance check, not a browsing surface.
// Expiring/expired/archived counts stay out of here deliberately; they
// belong in Catalog's own filters. Held sales and stock health ARE shown
// here since both are genuinely actionable in the next few minutes, and
// the data backing them (stats.heldSalesCount/stockHealth) is already
// fetched as part of the normal local refresh — no extra query needed.
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Only true until the very first refresh resolves — a pull-to-refresh
  // afterward uses the RefreshControl spinner instead, so existing values
  // stay on screen rather than being replaced by skeletons again.
  const [initialLoading, setInitialLoading] = useState(true);
  // Sales are push-only and never synced back down to the device (see
  // CLAUDE.md), so the local sales table only ever has what THIS device
  // created — fine for shift status, wrong for "today's revenue" and the
  // trend chart once other devices add sales server-side. Fetched live
  // here; falls back to the local-only numbers if the device is offline.
  const [todaySalesTotal, setTodaySalesTotal] = useState<number | null>(null);
  const [todaySalesCount, setTodaySalesCount] = useState<number | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<DailyRevenuePoint[] | null>(null);
  const [negativeStockBatchCount, setNegativeStockBatchCount] = useState(0);
  const [autoClosedShiftConflictCount, setAutoClosedShiftConflictCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!companyId || !locationId) return;
    try {
      // The two local DB reads and the live network call are independent —
      // run them together instead of making the network round trip wait on
      // the (much faster) local queries first.
      const [localResult, shiftResult, summaryResult] = await Promise.allSettled([
        getDashboardStats(companyId, locationId),
        localShiftService.getCurrentShift(companyId, locationId),
        dashboardApi.summary(companyId),
      ]);

      if (localResult.status === 'fulfilled') setStats(localResult.value);
      if (shiftResult.status === 'fulfilled') setShiftOpen(shiftResult.value !== null);

      if (summaryResult.status === 'fulfilled') {
        const summary = summaryResult.value;
        setTodaySalesTotal(summary.todayRevenue);
        setTodaySalesCount(summary.todaySalesCount);
        setRevenueTrend(summary.revenueTrend.map((p) => ({ date: p.date.slice(0, 10), total: p.revenue })));
        setNegativeStockBatchCount(summary.negativeStockBatchCount);
        setAutoClosedShiftConflictCount(summary.autoClosedShiftConflictCount);
      } else {
        // Offline or request failed — the local-only stats already computed
        // above cover this device's own sales, which is the best we can do.
        setTodaySalesTotal(null);
        setTodaySalesCount(null);
        setRevenueTrend(null);
        setNegativeStockBatchCount(0);
        setAutoClosedShiftConflictCount(0);
      }
    } finally {
      setInitialLoading(false);
    }
  }, [companyId, locationId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncNow();
      await refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <ScrollView
        contentContainerClassName="gap-5 p-5 pb-10"
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={onSync} />}>
        <View>
          <Text className="text-2xl font-bold text-text-primary">
            {t('dashboard.hello')}, {user?.name?.split(' ')[0] ?? 'there'}
          </Text>
          <Text className="text-sm text-text-secondary">{locationName ?? t('drawer.noLocation')}</Text>
          {syncError ? <Text className="mt-1 text-xs text-error">{syncError}</Text> : null}
        </View>

        {negativeStockBatchCount + autoClosedShiftConflictCount > 0 ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-error/10 p-4">
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-error">{t('dashboard.reconciliationTitle')}</Text>
              {negativeStockBatchCount > 0 ? (
                <Text className="mt-0.5 text-xs text-text-secondary">
                  {t('dashboard.negativeBatchesMsg').replace('{count}', String(negativeStockBatchCount))}
                </Text>
              ) : null}
              {autoClosedShiftConflictCount > 0 ? (
                <Text className="mt-0.5 text-xs text-text-secondary">
                  {t('dashboard.shiftConflictMsg').replace('{count}', String(autoClosedShiftConflictCount))}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {!initialLoading && stats && stats.heldSalesCount > 0 ? (
          <Pressable
            onPress={() => router.push('/held-sales')}
            className="flex-row items-center gap-3 rounded-2xl bg-accent-blue-soft p-4 active:opacity-80">
            <Ionicons name="pause-circle-outline" size={20} color={colors.accentBlue} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-text-primary">
                {stats.heldSalesCount} {stats.heldSalesCount === 1 ? t('dashboard.heldSale') : t('dashboard.heldSales').toLowerCase()}
              </Text>
              <Text className="text-xs text-text-secondary">{t('dashboard.heldSalesTapToResume')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.iconMuted} />
          </Pressable>
        ) : null}

        {initialLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
              <StatTile
                icon="cash-outline"
                iconBg="bg-accent-blue-soft"
                iconColor={colors.accentBlue}
                label={t('dashboard.todaySales')}
                value={formatCurrency(todaySalesTotal ?? stats?.todaySalesTotal ?? 0, currency)}
                sub={`${todaySalesCount ?? stats?.todaySalesCount ?? 0} ${t('dashboard.salesSub')}`}
              />
              <StatTile
                icon="alert-circle-outline"
                iconBg="bg-accent-amber-soft"
                iconColor={colors.accentAmber}
                label={t('dashboard.lowStock')}
                value={`${stats?.lowStockCount ?? 0}`}
                sub={t('dashboard.productsSub')}
                tone={stats && stats.lowStockCount > 0 ? 'warning' : 'default'}
                onPress={() => router.push('/catalog')}
              />
              <StatTile
                icon="wallet-outline"
                iconBg={shiftOpen ? 'bg-success/15' : 'bg-accent-orange-soft'}
                iconColor={shiftOpen ? colors.success : colors.accentOrange}
                label={t('dashboard.cashRegister')}
                value={shiftOpen === null ? '—' : shiftOpen ? t('dashboard.shiftOpenValue') : t('dashboard.shiftClosedValue')}
                sub={t('dashboard.shiftStatusSub')}
                tone={shiftOpen ? 'success' : 'default'}
                onPress={() => router.push('/shift')}
              />
            </View>

            <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
              <Text className="text-sm font-bold text-text-primary">{t('dashboard.revenueTrend')}</Text>
              <View className="mt-3 items-center">
                <RevenueTrendChart points={revenueTrend ?? stats?.revenueTrend ?? []} />
              </View>
            </View>

            {stats ? (
              <Pressable
                onPress={() => router.push('/catalog')}
                className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5 active:opacity-80">
                <Text className="text-sm font-bold text-text-primary">{t('dashboard.stockHealth')}</Text>
                <View className="mt-3">
                  <StockHealthDonut health={stats.stockHealth} />
                </View>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Mirrors the real 3-tile-row + chart-card layout exactly, so the swap from
// skeleton to real content doesn't visibly jump around once data arrives.
function DashboardSkeleton() {
  return (
    <>
      <View className="flex-row flex-wrap gap-3">
        {[0, 1, 2].map((i) => (
          <View key={i} className="min-w-[30%] flex-1 gap-2 rounded-2xl bg-surface p-4 shadow-sm shadow-black/5">
            <Skeleton width={36} height={36} radius={12} />
            <Skeleton width="70%" height={10} />
            <Skeleton width="50%" height={20} />
            <Skeleton width="40%" height={10} />
          </View>
        ))}
      </View>
      <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
        <Skeleton width="40%" height={13} />
        <View className="mt-4">
          <Skeleton height={140} radius={12} />
        </View>
      </View>
    </>
  );
}

function StatTile({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  tone = 'default',
  onPress,
}: {
  icon: IconName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  tone?: 'default' | 'warning' | 'success';
  onPress?: () => void;
}) {
  const valueColor = tone === 'warning' ? 'text-accent-amber' : tone === 'success' ? 'text-success' : 'text-text-primary';
  const Container = onPress ? Pressable : View;
  return (
    <Container onPress={onPress} className="min-w-[30%] flex-1 rounded-2xl bg-surface p-4 shadow-sm shadow-black/5">
      <View className={`h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</Text>
      <Text className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</Text>
      <Text className="text-xs text-text-secondary">{sub}</Text>
    </Container>
  );
}
