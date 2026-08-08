import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { useAuthStore } from '@/lib/auth/store';
import { useThemeColors } from '@/lib/theme/colors';

const WINDOWS = [30, 90];

export default function DemandForecastScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const colors = useThemeColors();
  const [days, setDays] = useState(30);

  const { data = [], isLoading } = useQuery({
    queryKey: ['demand-forecast', companyId, days],
    queryFn: () => reportsApi.demandForecast(companyId!, { days, horizon: days }),
    enabled: !!companyId,
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Demand forecast</Text>
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
        {isLoading ? (
          <Text className="py-10 text-center text-sm text-text-secondary">Loading…</Text>
        ) : data.length === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">No sales in this period to forecast from.</Text>
        ) : (
          data.map((i) => {
            const urgent = i.daysOfCover != null && i.daysOfCover <= 7;
            return (
              <Pressable
                key={i.productId}
                onPress={() => router.push({ pathname: '/product-detail', params: { id: i.productId } })}
                className="rounded-xl bg-surface p-3 active:opacity-70">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{i.productName}</Text>
                  <Text className={`text-sm font-bold ${urgent ? 'text-error' : 'text-text-primary'}`}>
                    {i.daysOfCover == null ? '—' : `${i.daysOfCover}d cover`}
                  </Text>
                </View>
                <Text className="mt-0.5 text-xs text-text-secondary">
                  {i.unitsSold} sold · {i.avgDailyUnits}/day · stock {i.currentStock}
                  {i.suggestedReorder > 0 ? ` · reorder +${i.suggestedReorder}` : ''}
                  {i.trendPct !== 0 ? ` · ${i.trendPct > 0 ? '▲' : '▼'}${Math.abs(i.trendPct)}%` : ''}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
