import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { PurchaseOrderStatus } from '@/lib/api/enums';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import type { PurchaseOrderSummaryResponse } from '@/lib/api/types/purchaseOrders';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { SkeletonList } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, purchaseOrderStatusLabel } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { purchaseOrderStatusTone } from '@/lib/purchaseOrderStatusTone';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

const STATUS_FILTERS: (PurchaseOrderStatus | 'all')[] = [
  'all',
  PurchaseOrderStatus.Pending,
  PurchaseOrderStatus.PartiallyReceived,
  PurchaseOrderStatus.Received,
  PurchaseOrderStatus.Cancelled,
];

function filterLabel(value: PurchaseOrderStatus | 'all'): string {
  return value === 'all' ? 'All' : purchaseOrderStatusLabel(value);
}

export default function PurchaseOrdersScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [allOrders, setAllOrders] = useState<PurchaseOrderSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetched unfiltered once, filtered client-side — lets every status chip
  // show a live count and switching filters feel instant, no re-fetch per tap.
  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setAllOrders(await purchaseOrdersApi.list(companyId));
    } catch (err) {
      showAlert('Could not load purchase orders', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allOrders.length };
    for (const o of allOrders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [allOrders]);

  const visibleOrders = useMemo(
    () => (statusFilter === 'all' ? allOrders : allOrders.filter((o) => o.status === statusFilter)),
    [allOrders, statusFilter],
  );

  const openCount = (counts[PurchaseOrderStatus.Pending] ?? 0) + (counts[PurchaseOrderStatus.PartiallyReceived] ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Purchase orders</Text>
          <Pressable
            onPress={() => router.push('/purchase-order-form')}
            accessibilityLabel="New purchase order"
            className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-90">
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {!loading && openCount > 0 ? (
          <Text className="mt-2 text-xs text-text-secondary">
            {openCount} order{openCount === 1 ? '' : 's'} still awaiting stock
          </Text>
        ) : null}

        <FiltersDisclosure active={statusFilter !== 'all'}>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={String(s)}
                label={`${filterLabel(s)} (${counts[s] ?? 0})`}
                active={statusFilter === s}
                onPress={() => setStatusFilter(s)}
              />
            ))}
          </View>
        </FiltersDisclosure>
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visibleOrders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshing={false}
          onRefresh={refresh}
          renderItem={({ item }) => {
            const tone = purchaseOrderStatusTone(item.status, colors);
            const isCancelled = item.status === PurchaseOrderStatus.Cancelled;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/purchase-order-detail', params: { id: item.id } })}
                className={`rounded-xl bg-surface p-3.5 ${isCancelled ? 'opacity-60' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{item.supplierName}</Text>
                  <View className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${tone.badgeClass}`}>
                    <Ionicons name={tone.icon} size={12} color={tone.iconColor} />
                    <Text className={`text-[11px] font-bold ${tone.textClass}`}>{purchaseOrderStatusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text className="mt-1 text-xs text-text-secondary">
                  {item.locationName} · {item.lineCount} line{item.lineCount === 1 ? '' : 's'} · {formatCurrency(item.totalCost, currency)}
                </Text>
                <Text className="mt-0.5 text-xs text-text-secondary">{new Date(item.createdAt).toLocaleString()}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-sm text-text-secondary">No purchase orders match this filter.</Text>
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
