import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import type { ExpiryAlertItem, StockAlertItem } from '@/lib/api/types/catalog';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';

export default function AlertsScreen() {
  const companyId = useAuthStore((s) => s.companyId);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', companyId],
    queryFn: () => productsApi.alerts(companyId!, 30),
    enabled: !!companyId,
  });

  const total =
    (data?.outOfStock.length ?? 0) + (data?.lowStock.length ?? 0) + (data?.expiringSoon.length ?? 0) + (data?.expired.length ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Alerts</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-5 p-5">
        {isLoading ? (
          <Text className="py-10 text-center text-sm text-text-secondary">Loading…</Text>
        ) : total === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">✅ Nothing needs attention right now.</Text>
        ) : (
          <>
            <StockSection title="⛔ Out of stock" items={data!.outOfStock} tone="error" />
            <StockSection title="⚠️ Low stock" items={data!.lowStock} tone="warn" showThreshold />
            <ExpirySection title="⏰ Expired" items={data!.expired} tone="error" />
            <ExpirySection title="⏳ Expiring soon" items={data!.expiringSoon} tone="warn" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StockSection({ title, items, tone, showThreshold }: { title: string; items: StockAlertItem[]; tone: 'error' | 'warn'; showThreshold?: boolean }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text className="mb-2 text-sm font-bold text-text-primary">{title} ({items.length})</Text>
      <View className="overflow-hidden rounded-xl bg-surface">
        {items.map((p) => {
          const onOrder = !!p.openPurchaseOrderId;
          return (
            <Pressable
              key={p.productId}
              onPress={() =>
                onOrder
                  ? router.push({ pathname: '/purchase-order-detail', params: { id: p.openPurchaseOrderId! } })
                  : router.push({ pathname: '/stock-receive', params: { productId: p.productId } })
              }
              className="flex-row items-center justify-between border-b border-border/50 px-4 py-3 last:border-0 active:opacity-70">
              <View className="flex-1 pr-2">
                <Text className="text-sm text-text-primary">{p.name}</Text>
                {onOrder ? <Text className="text-xs text-text-secondary">🧾 already on order — open to print / share</Text> : null}
              </View>
              {onOrder ? (
                <Text className="text-xs font-semibold text-primary">On order</Text>
              ) : showThreshold ? (
                <Text className={`text-xs font-semibold ${tone === 'error' ? 'text-error' : 'text-accent-amber'}`}>{p.currentStock} / {p.lowStockThreshold}</Text>
              ) : (
                <Text className="text-xs font-semibold text-error">0</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ExpirySection({ title, items, tone }: { title: string; items: ExpiryAlertItem[]; tone: 'error' | 'warn' }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text className="mb-2 text-sm font-bold text-text-primary">{title} ({items.length})</Text>
      <View className="overflow-hidden rounded-xl bg-surface">
        {items.map((b) => (
          <Pressable
            key={b.batchId}
            onPress={() => router.push({ pathname: '/product-detail', params: { id: b.productId } })}
            className="flex-row items-center justify-between border-b border-border/50 px-4 py-3 last:border-0 active:opacity-70">
            <View className="flex-1 pr-2">
              <Text className="text-sm text-text-primary">{b.name}</Text>
              <Text className="text-xs text-text-secondary">batch {b.batchNumber} · {b.expiryDate.slice(0, 10)} · {b.quantityInBaseUnits} units</Text>
            </View>
            <Text className={`text-xs font-semibold ${tone === 'error' ? 'text-error' : 'text-accent-amber'}`}>
              {b.daysUntilExpiry < 0 ? `${-b.daysUntilExpiry}d ago` : `${b.daysUntilExpiry}d`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
