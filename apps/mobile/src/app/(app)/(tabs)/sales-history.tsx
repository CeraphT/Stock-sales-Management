import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { salesApi } from '@/lib/api/endpoints/sales';
import type { SaleSummaryResponse } from '@/lib/api/types/sales';
import { PaymentMethod } from '@/lib/api/enums';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { SkeletonList } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabel } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { shareList } from '@/lib/reports/listActions';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

type DateRange = 'today' | 'week' | 'month' | 'all';

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const METHOD_FILTERS: { value: PaymentMethod | 'all'; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: PaymentMethod.Cash, label: 'Cash' },
  { value: PaymentMethod.MobileMoney, label: 'Mobile Money' },
  { value: PaymentMethod.Credit, label: 'Credit' },
  { value: PaymentMethod.StoreCredit, label: 'Store credit' },
  { value: PaymentMethod.GiftCard, label: 'Gift card' },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeToFromTo(range: DateRange): { from?: string; to?: string } {
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
  return {};
}

export default function SalesHistoryScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();

  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');
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
        const { from, to } = rangeToFromTo(dateRange);
        const result = await salesApi.history(companyId, targetPage, from, to);
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
    [companyId, dateRange],
  );

  useFocusEffect(
    useCallback(() => {
      load(1, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, dateRange]),
  );

  const visibleItems = useMemo(
    () => (methodFilter === 'all' ? items : items.filter((item) => item.paymentMethod === methodFilter)),
    [items, methodFilter],
  );

  const onShare = () => {
    shareList({
      companyName,
      currency,
      title: 'Sales History',
      subtitle: `${DATE_RANGES.find((r) => r.value === dateRange)?.label} · loaded ${visibleItems.length} sale${visibleItems.length === 1 ? '' : 's'}`,
      primaryColumnLabel: 'Cashier',
      secondaryColumnLabel: 'Payment',
      rows: visibleItems.map((item) => ({
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
          <Pressable onPress={onShare} hitSlop={8} disabled={visibleItems.length === 0} accessibilityLabel="Share PDF">
            <Ionicons name="share-outline" size={20} color={visibleItems.length > 0 ? colors.primary : colors.iconMuted} />
          </Pressable>
        </View>

        <FiltersDisclosure active={dateRange !== 'today' || methodFilter !== 'all'}>
          <View className="flex-row flex-wrap gap-2">
            {DATE_RANGES.map((r) => (
              <FilterChip key={r.value} label={r.label} active={dateRange === r.value} onPress={() => setDateRange(r.value)} />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {METHOD_FILTERS.map((m) => (
              <FilterChip
                key={String(m.value)}
                label={m.label}
                active={methodFilter === m.value}
                onPress={() => setMethodFilter(m.value)}
              />
            ))}
          </View>
        </FiltersDisclosure>
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visibleItems}
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
              <Text className="text-sm text-text-secondary">No sales match these filters.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-primary' : 'border-border bg-background'}`}>
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}
