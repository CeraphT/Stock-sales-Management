import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';

const WINDOWS = [60, 90, 180];

export default function DeadStockScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const [days, setDays] = useState(60);

  const { data = [], isLoading } = useQuery({
    queryKey: ['dead-stock', companyId, days],
    queryFn: () => reportsApi.deadStock(companyId!, { days }),
    enabled: !!companyId,
  });

  const totalValue = data.reduce((s, d) => s + d.stockValue, 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Dead stock</Text>
          <View className="w-12" />
        </View>
      </View>

      <View className="flex-row justify-end gap-1.5 px-5 pt-3">
        {WINDOWS.map((w) => (
          <Pressable
            key={w}
            onPress={() => setDays(w)}
            className="rounded-lg border px-3 py-1"
            style={{ borderColor: days === w ? colors.primary : colors.border, backgroundColor: days === w ? colors.primary + '14' : 'transparent' }}>
            <Text className="text-xs font-bold" style={{ color: days === w ? colors.primary : colors.textSecondary }}>{w}d</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-2 p-5">
        {data.length > 0 ? (
          <View className="mb-2 rounded-xl bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Value tied up in dead stock</Text>
            <Text className="mt-1 text-2xl font-extrabold text-error">{formatCurrency(totalValue, currency)}</Text>
            <Text className="text-xs text-text-secondary">{data.length} item(s), no sale in {days}d</Text>
          </View>
        ) : null}

        {isLoading ? (
          <Text className="py-10 text-center text-sm text-text-secondary">Loading…</Text>
        ) : data.length === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">No dead stock — everything's moving. 🎉</Text>
        ) : (
          data.map((d) => (
            <Pressable
              key={d.productId}
              onPress={() => router.push({ pathname: '/product-detail', params: { id: d.productId } })}
              className="flex-row items-center justify-between rounded-xl bg-surface p-3 active:opacity-70">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-text-primary">{d.productName}</Text>
                <Text className="text-xs text-text-secondary">
                  stock {d.currentStock} · {d.lastSaleDate ? `last ${d.lastSaleDate.slice(0, 10)} (${d.daysSinceLastSale}d ago)` : 'never sold'}
                </Text>
              </View>
              <Text className="text-sm font-bold text-text-primary">{formatCurrency(d.stockValue, currency)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
