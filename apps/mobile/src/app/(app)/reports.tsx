import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { reportsApi } from '@/lib/api/endpoints/reports';
import type { SalesSummaryResponse, TopProductItem } from '@/lib/api/types/reports';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { shareReport, viewOrPrintReport } from '@/lib/reports/reportActions';
import type { ReportData } from '@/lib/reports/reportTypes';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function ReportsScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictReportsAndFullSales));
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductItem[]>([]);

  const run = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [summaryResult, topResult] = await Promise.all([
        reportsApi.salesSummary(companyId, { from, to }),
        reportsApi.topProducts(companyId, { from, to, limit: 10 }),
      ]);
      setSummary(summaryResult);
      setTopProducts(topResult);
    } catch (err) {
      showAlert('Could not load report', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toReportData = (): ReportData | null => {
    if (!summary) return null;
    return { companyName, currency, from, to, summary, topProducts };
  };

  const onView = () => {
    const data = toReportData();
    if (!data) return;
    viewOrPrintReport(data).catch((err) =>
      showAlert('Could not open report', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  const onShare = () => {
    const data = toReportData();
    if (!data) return;
    shareReport(data).catch((err) =>
      showAlert('Could not share report', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Reports</Text>
          <Pressable onPress={onShare} hitSlop={8} disabled={!summary} accessibilityLabel="Share report PDF">
            <Ionicons name="share-outline" size={20} color={summary ? colors.primary : colors.iconMuted} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="From" value={from} onChange={setFrom} />
          </View>
          <View className="flex-1">
            <DateField label="To" value={to} onChange={setTo} />
          </View>
        </View>
        <Button title="Run report" onPress={run} />

        {loading ? (
          <ActivityIndicator className="mt-4" />
        ) : summary ? (
          <>
            <View className="flex-row flex-wrap gap-3">
              <View className="w-[47%] rounded-2xl bg-surface p-4">
                <Text className="text-xs uppercase tracking-wide text-text-secondary">Revenue</Text>
                <Text className="mt-1 text-base font-bold text-text-primary">{formatCurrency(summary.totalRevenue, currency)}</Text>
              </View>
              <View className="w-[47%] rounded-2xl bg-surface p-4">
                <Text className="text-xs uppercase tracking-wide text-text-secondary">Profit</Text>
                <Text className="mt-1 text-base font-bold text-text-primary">{formatCurrency(summary.totalProfit, currency)}</Text>
              </View>
              <View className="w-[47%] rounded-2xl bg-surface p-4">
                <Text className="text-xs uppercase tracking-wide text-text-secondary">Sales count</Text>
                <Text className="mt-1 text-base font-bold text-text-primary">{summary.totalSalesCount}</Text>
              </View>
              <View className="w-[47%] rounded-2xl bg-surface p-4">
                <Text className="text-xs uppercase tracking-wide text-text-secondary">Average sale</Text>
                <Text className="mt-1 text-base font-bold text-text-primary">{formatCurrency(summary.averageSaleValue, currency)}</Text>
              </View>
            </View>

            <Pressable
              onPress={onView}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3.5 active:opacity-90">
              <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">View / print report (PDF)</Text>
            </Pressable>

            <Text className="text-sm font-bold text-text-primary">Top products</Text>
            {topProducts.length === 0 ? (
              <Text className="text-sm text-text-secondary">No sales in this period.</Text>
            ) : (
              topProducts.map((p) => (
                <View key={p.productId} className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-semibold text-text-primary">{p.productName}</Text>
                    <Text className="text-xs text-text-secondary">{p.quantitySold} sold</Text>
                  </View>
                  <Text className="text-sm font-bold text-primary">{formatCurrency(p.revenue, currency)}</Text>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
