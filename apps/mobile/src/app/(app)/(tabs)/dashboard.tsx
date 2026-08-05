import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { RevenueTrendChart } from '@/components/RevenueTrendChart';
import { Skeleton } from '@/components/Skeleton';
import { StatCard, type StatColor } from '@/components/StatCard';
import { StockHealthDonut } from '@/components/StockHealthDonut';
import { dashboardApi } from '@/lib/api/endpoints/dashboard';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { type DashboardStats, type DailyRevenuePoint, getDashboardStats } from '@/lib/local/dashboardQueries';
import { localShiftService } from '@/lib/local/shiftService';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { toast } from '@/lib/ui/toastStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

type Summary = Awaited<ReturnType<typeof dashboardApi.summary>>;

// Mirrors the desktop Dashboard (apps/desktop/src/screens/Dashboard.tsx): a
// 6-tile stat grid, a revenue-trend card, a stock-health card and a recent-sales
// list — all on rounded-card surfaces. Mobile keeps the two extra actionable
// banners (reconciliation + held sales) on top.
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  // Sales are push-only and never synced back down (see CLAUDE.md), so today's
  // revenue/trend come from the live summary, falling back to this device's own
  // local numbers when offline.
  const [todaySalesTotal, setTodaySalesTotal] = useState<number | null>(null);
  const [todaySalesCount, setTodaySalesCount] = useState<number | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<DailyRevenuePoint[] | null>(null);

  const negativeStockBatchCount = summary?.negativeStockBatchCount ?? 0;
  const autoClosedShiftConflictCount = summary?.autoClosedShiftConflictCount ?? 0;

  const refresh = useCallback(async () => {
    if (!companyId || !locationId) return;
    try {
      const [localResult, , summaryResult] = await Promise.allSettled([
        getDashboardStats(companyId, locationId),
        localShiftService.getCurrentShift(companyId, locationId),
        dashboardApi.summary(companyId),
      ]);

      if (localResult.status === 'fulfilled') setStats(localResult.value);

      if (summaryResult.status === 'fulfilled') {
        const s = summaryResult.value;
        setSummary(s);
        setTodaySalesTotal(s.todayRevenue);
        setTodaySalesCount(s.todaySalesCount);
        setRevenueTrend(s.revenueTrend.map((p) => ({ date: p.date.slice(0, 10), total: p.revenue })));
      } else {
        // Offline — keep this device's local-only numbers for today.
        setSummary(null);
        setTodaySalesTotal(null);
        setTodaySalesCount(null);
        setRevenueTrend(null);
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
    try {
      await syncNow();
      await refresh();
      toast(t('sync.done'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('sync.failed'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const cards: { key: string; icon: string; label: string; value: string; color: StatColor; onPress: () => void }[] = [
    { key: 'rev', icon: '💰', label: t('dashboard.revenueToday'), value: formatCurrency(todaySalesTotal ?? stats?.todaySalesTotal ?? 0, currency), color: 'primary', onPress: () => router.push({ pathname: '/sales-history', params: { range: 'today' } }) },
    { key: 'low', icon: '⚠️', label: t('dashboard.lowStock'), value: String(summary?.lowStockCount ?? stats?.lowStockCount ?? 0), color: 'amber', onPress: () => router.push({ pathname: '/catalog', params: { stock: 'low' } }) },
    { key: 'out', icon: '⛔', label: t('dashboard.outOfStock'), value: String(summary?.outOfStockCount ?? 0), color: 'red', onPress: () => router.push({ pathname: '/catalog', params: { stock: 'out' } }) },
    { key: 'exp', icon: '⏳', label: t('dashboard.expiringSoon'), value: String(summary?.expiringSoonCount ?? 0), color: 'orange', onPress: () => router.push({ pathname: '/catalog', params: { stock: 'expiring' } }) },
  ];

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
        </View>

        {negativeStockBatchCount + autoClosedShiftConflictCount > 0 ? (
          <View className="flex-row items-start gap-3 rounded-card bg-error/10 p-4">
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
            className="flex-row items-center gap-3 rounded-card bg-accent-blue/10 p-4 active:opacity-80">
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
            <View className="-m-1.5 flex-row flex-wrap">
              {cards.map((c) => (
                <View key={c.key} className="w-1/2 p-1.5">
                  <StatCard icon={<Text className="text-base">{c.icon}</Text>} label={c.label} value={c.value} color={c.color} onPress={c.onPress} />
                </View>
              ))}
            </View>

            <View className="rounded-card border border-border bg-surface p-5">
              <Text className="text-sm font-bold text-text-primary">{t('dashboard.revenueTrend')}</Text>
              <View className="mt-3 items-center">
                <RevenueTrendChart points={revenueTrend ?? stats?.revenueTrend ?? []} />
              </View>
            </View>

            {stats ? (
              <Pressable
                onPress={() => router.push('/catalog')}
                className="rounded-card border border-border bg-surface p-5 active:opacity-80">
                <Text className="text-sm font-bold text-text-primary">{t('dashboard.stockHealth')}</Text>
                <View className="mt-3">
                  <StockHealthDonut health={stats.stockHealth} />
                </View>
              </Pressable>
            ) : null}

            {summary?.recentSales?.length ? (
              <View className="overflow-hidden rounded-card border border-border bg-surface">
                <Text className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">{t('dashboard.recentSales')}</Text>
                {summary.recentSales.slice(0, 6).map((s, i, arr) => (
                  <View
                    key={s.id}
                    className={`flex-row items-center justify-between px-4 py-2.5 ${i === arr.length - 1 ? '' : 'border-b border-border/60'}`}>
                    <View className="flex-1 pr-3">
                      <Text numberOfLines={1} className="text-sm text-text-primary">
                        {s.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')}
                      </Text>
                      <Text className="text-xs text-text-secondary">
                        {new Date(s.timestamp).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-text-primary">{formatCurrency(s.total, currency)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Mirrors the 6-tile grid + chart card so the skeleton→content swap doesn't jump.
function DashboardSkeleton() {
  return (
    <>
      <View className="-m-1.5 flex-row flex-wrap">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} className="w-1/2 p-1.5">
            <View className="gap-2 rounded-card border border-border bg-surface p-4">
              <Skeleton width={36} height={36} radius={10} />
              <Skeleton width="70%" height={10} />
              <Skeleton width="50%" height={20} />
            </View>
          </View>
        ))}
      </View>
      <View className="rounded-card border border-border bg-surface p-5">
        <Skeleton width="40%" height={13} />
        <View className="mt-4">
          <Skeleton height={140} radius={12} />
        </View>
      </View>
    </>
  );
}
