import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { DateField } from '@/components/DateField';
import { NetworkError } from '@/lib/api/client';
import { salesApi } from '@/lib/api/endpoints/sales';
import type { SaleSummaryResponse } from '@/lib/api/types/sales';
import { SkeletonList } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabel } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { localSalesService } from '@/lib/local/salesService';
import { shareList } from '@/lib/reports/listActions';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Deep-link presets from the dashboard (?range=today|week|month|all) map to a
// concrete From/To range, since the filter itself is now a free date range.
function rangeToFromTo(range: string): { from: string; to: string } {
  const today = new Date();
  if (range === 'today') {
    const iso = isoDate(today);
    return { from: iso, to: iso };
  }
  if (range === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: isoDate(start), to: isoDate(today) };
  }
  if (range === 'month') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { from: isoDate(start), to: isoDate(today) };
  }
  return { from: '', to: '' };
}

export default function SalesHistoryScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const { t } = useTranslation();

  // Free From/To date range (YYYY-MM-DD, '' = unset) — matches desktop.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Deep-link from the dashboard: ?range=today|week|month|all pre-applies a range.
  const { range: rangeParam } = useLocalSearchParams<{ range?: string }>();
  useEffect(() => {
    if (rangeParam === 'today' || rangeParam === 'week' || rangeParam === 'month' || rangeParam === 'all') {
      const r = rangeToFromTo(rangeParam);
      setFrom(r.from);
      setTo(r.to);
    }
  }, [rangeParam]);

  const [items, setItems] = useState<SaleSummaryResponse[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Offline-first: the server holds the full multi-device history, but the
  // local mirror always has this device's own sales. They are shown at once,
  // then merged with the server page when (if) it answers; offline, the local
  // list stays with a notice instead of an error.
  const [offline, setOffline] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Server page in flight while local rows are already on screen.
  const [fetchingServer, setFetchingServer] = useState(false);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!companyId) {
        setLoading(false);
        return;
      }
      let local: SaleSummaryResponse[] = [];
      let pending = new Set<string>();
      if (replace) {
        try {
          const l = await localSalesService.getSalesHistory(companyId, { from: from || undefined, to: to || undefined });
          local = l.items;
          pending = l.pendingIds;
        } catch {
          /* local read failed — the server answer is all we have */
        }
        setPendingIds(pending);
        if (local.length > 0) {
          setItems(local);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setLoadingMore(true);
      }
      setFetchingServer(true);
      try {
        const result = await salesApi.history(companyId, targetPage, from || undefined, to || undefined);
        if (replace) {
          // This device's not-yet-pushed sales aren't on the server yet: keep them on top.
          const serverIds = new Set(result.items.map((s) => s.id));
          const unsynced = local.filter((s) => pending.has(s.id) && !serverIds.has(s.id));
          setItems([...unsynced, ...result.items].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        } else {
          setItems((prev) => [...prev, ...result.items]);
        }
        setHasMore(result.hasMore);
        setPage(targetPage);
        setOffline(false);
      } catch (err) {
        if (err instanceof NetworkError) {
          setOffline(true);
          if (replace) {
            setItems(local);
            setHasMore(false);
          }
        } else {
          showAlert('Could not load sales', err instanceof Error ? err.message : 'Something went wrong.');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setFetchingServer(false);
      }
    },
    [companyId, from, to],
  );

  useFocusEffect(
    useCallback(() => {
      load(1, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, from, to]),
  );

  const rangeLabel = from || to ? `${from || '…'} → ${to || 'today'}` : 'All time';

  const onShare = () => {
    shareList({
      companyName,
      currency,
      title: 'Sales History',
      subtitle: `${rangeLabel} · loaded ${items.length} sale${items.length === 1 ? '' : 's'}`,
      primaryColumnLabel: 'Cashier',
      secondaryColumnLabel: 'Payment',
      rows: items.map((item) => ({
        timestamp: item.timestamp,
        primaryLabel: item.cashierName,
        secondaryLabel: `${paymentMethodLabel(item.paymentMethod)} · ${item.itemCount} items`,
        total: item.total,
      })),
    }).catch((err) => showAlert('Could not share', err instanceof Error ? err.message : 'Something went wrong.'));
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <View className="w-12">{fetchingServer && !loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}</View>
          <Text className="text-lg font-bold text-text-primary">Sales history</Text>
          <Pressable onPress={onShare} hitSlop={8} disabled={items.length === 0} accessibilityLabel="Share PDF">
            <Ionicons name="share-outline" size={20} color={items.length > 0 ? colors.primary : colors.iconMuted} />
          </Pressable>
        </View>

        {/* From/To date range — matches desktop's DateRange filter. */}
        <View className="mt-3 flex-row items-end gap-2">
          <View className="flex-1">
            <DateField label="From" value={from || null} onChange={setFrom} placeholder="Any" />
          </View>
          <View className="flex-1">
            <DateField
              label="To"
              value={to || null}
              onChange={setTo}
              minimumDate={from ? new Date(`${from}T00:00:00`) : undefined}
              placeholder="Any"
            />
          </View>
          {from || to ? (
            <Pressable
              onPress={() => {
                setFrom('');
                setTo('');
              }}
              hitSlop={8}
              className="pb-3">
              <Text className="text-xs font-semibold text-text-secondary">Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {offline ? (
        <View className="flex-row items-center gap-2 border-b border-border px-5 py-2.5" style={{ backgroundColor: colors.accentAmber + '1A' }}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.accentAmber} />
          <Text className="flex-1 text-xs font-semibold" style={{ color: colors.accentAmber }}>
            {t('history.offline')}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshing={false}
          onRefresh={() => load(1, true)}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(page + 1, false);
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/sale-detail', params: { id: item.id } })}
              className="rounded-2xl bg-surface p-4 shadow-sm shadow-black/5 active:opacity-80">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">{paymentMethodLabel(item.paymentMethod)}</Text>
                <Text className="text-base font-bold text-primary">{formatCurrency(item.total, currency)}</Text>
              </View>
              <Text className="mt-1 text-xs text-text-secondary">
                {item.cashierName} · {item.itemCount} items · {new Date(item.timestamp).toLocaleString()}
              </Text>
              {pendingIds.has(item.id) ? (
                <View className="mt-2 flex-row items-center gap-1 self-start rounded-full px-2 py-0.5" style={{ backgroundColor: colors.accentAmber + '22' }}>
                  <Ionicons name="cloud-upload-outline" size={12} color={colors.accentAmber} />
                  <Text className="text-[11px] font-semibold" style={{ color: colors.accentAmber }}>{t('history.pending')}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" /> : null}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-sm text-text-secondary">No sales in this period.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
