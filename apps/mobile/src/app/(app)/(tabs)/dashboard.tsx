import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { RevenueTrendChart } from '@/components/RevenueTrendChart';
import { Skeleton } from '@/components/Skeleton';
import { StatCard, type StatColor } from '@/components/StatCard';
import { StockHealthDonut } from '@/components/StockHealthDonut';
import { UserRole } from '@/lib/api/enums';
import { dashboardApi } from '@/lib/api/endpoints/dashboard';
import { reconciliationApi } from '@/lib/api/endpoints/reconciliation';
import { reportsApi } from '@/lib/api/endpoints/reports';
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
  // Revenue-trend range. 7d uses the fast dashboard summary (server) / local
  // fallback already loaded by refresh(); 30d/90d pull a zero-filled daily
  // series from the reports endpoint (sales are push-only, so the server is the
  // accurate multi-day/multi-device source — the local mirror is this-device-only).
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);
  const [extendedTrend, setExtendedTrend] = useState<DailyRevenuePoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const trendScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!companyId || trendDays === 7) {
      setExtendedTrend(null);
      return;
    }
    let cancelled = false;
    setTrendLoading(true);
    const to = new Date();
    to.setHours(0, 0, 0, 0);
    const from = new Date(to);
    from.setDate(from.getDate() - (trendDays - 1));
    reportsApi
      .salesSummary(companyId, { from: from.toISOString(), to: to.toISOString() })
      .then((res) => {
        if (cancelled) return;
        const byDate = new Map(res.dailyBreakdown.map((d) => [d.date.slice(0, 10), d.revenue]));
        const points: DailyRevenuePoint[] = [];
        for (let i = trendDays - 1; i >= 0; i--) {
          const day = new Date(to);
          day.setDate(day.getDate() - i);
          const key = day.toISOString().slice(0, 10);
          points.push({ date: key, total: byDate.get(key) ?? 0 });
        }
        setExtendedTrend(points);
      })
      .catch(() => {
        if (!cancelled) setExtendedTrend(null);
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, trendDays]);

  const trendPoints = trendDays === 7 ? (revenueTrend ?? stats?.revenueTrend ?? []) : (extendedTrend ?? []);

  const negativeStockBatchCount = summary?.negativeStockBatchCount ?? 0;
  const autoClosedShiftConflictCount = summary?.autoClosedShiftConflictCount ?? 0;
  const isAdmin = user?.role === UserRole.CompanyAdmin || user?.role === UserRole.SuperAdmin;
  const [acknowledging, setAcknowledging] = useState(false);

  // Admin-only: clear the auto-closed shift-conflict warnings (marks the
  // affected shifts reviewed server-side), then refresh so the banner updates.
  // Negative-stock batches are a real stock problem and are NOT cleared here.
  const onAcknowledgeConflicts = async () => {
    if (!companyId || acknowledging) return;
    setAcknowledging(true);
    try {
      const res = await reconciliationApi.acknowledgeShiftConflicts(companyId);
      await refresh();
      toast(res.acknowledged > 0 ? `${res.acknowledged} shift(s) marked reviewed.` : 'Nothing to review.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update.', 'error');
    } finally {
      setAcknowledging(false);
    }
  };

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
              {autoClosedShiftConflictCount > 0 && isAdmin ? (
                <Pressable
                  onPress={onAcknowledgeConflicts}
                  disabled={acknowledging}
                  className="mt-2 self-start rounded-lg bg-error/15 px-3 py-1.5 active:opacity-80">
                  <Text className="text-xs font-bold text-error">{acknowledging ? '…' : 'Mark as reviewed'}</Text>
                </Pressable>
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
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-text-primary">{t('dashboard.revenueTrend')}</Text>
                <View className="flex-row rounded-full bg-background p-0.5">
                  {([7, 30, 90] as const).map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setTrendDays(d)}
                      className={`rounded-full px-2.5 py-1 ${trendDays === d ? 'bg-primary' : ''}`}>
                      <Text className={`text-xs font-semibold ${trendDays === d ? 'text-white' : 'text-text-secondary'}`}>{d}D</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="mt-3">
                {trendLoading && extendedTrend === null ? (
                  <View className="h-[150px] items-center justify-center">
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <ScrollView
                    ref={trendScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onContentSizeChange={() => trendScrollRef.current?.scrollToEnd({ animated: false })}>
                    <RevenueTrendChart points={trendPoints} />
                  </ScrollView>
                )}
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
