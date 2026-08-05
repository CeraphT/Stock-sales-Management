import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { DateField } from '@/components/DateField';
import { salesApi } from '@/lib/api/endpoints/sales';
import type { SaleSummaryResponse } from '@/lib/api/types/sales';
import { SkeletonList } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabel } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
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

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!companyId) return;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await salesApi.history(companyId, targetPage, from || undefined, to || undefined);
        setItems((prev) => (replace ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(targetPage);
      } catch (err) {
        showAlert('Could not load sales', err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
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
          <View className="w-12" />
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
