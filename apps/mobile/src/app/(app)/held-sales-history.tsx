import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { SkeletonList } from '@/components/Skeleton';
import { salesApi } from '@/lib/api/endpoints/sales';
import type { HeldSaleSummaryResponse } from '@/lib/api/types/sales';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { shareList, viewOrPrintList } from '@/lib/reports/listActions';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { appLocale } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@stockflow/core/i18n/translations';

type DateRange = 'today' | 'week' | 'month' | 'all';

const DATE_RANGES: { value: DateRange; label: TranslationKey }[] = [
  { value: 'today', label: 'range.today' },
  { value: 'week', label: 'range.week' },
  { value: 'month', label: 'range.month' },
  { value: 'all', label: 'range.all' },
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

export default function HeldSalesHistoryScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [items, setItems] = useState<HeldSaleSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { from, to } = rangeToFromTo(dateRange);
      setItems(await salesApi.held(companyId, { from, to }));
    } catch (err) {
      showAlert(t('heldHistory.loadFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setLoading(false);
    }
  }, [companyId, dateRange]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onDiscard = (item: HeldSaleSummaryResponse) => {
    showAlert(t('heldHistory.discardTitle'), t('heldHistory.discardBody').replace('{location}', item.locationName).replace('{total}', formatCurrency(item.total, currency)), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('heldHistory.discard'),
        style: 'destructive',
        onPress: async () => {
          if (!companyId) return;
          try {
            await salesApi.discardHeld(companyId, item.id);
            await load();
          } catch (err) {
            showAlert(t('heldHistory.discardFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
          }
        },
      },
    ]);
  };

  const toListData = () => ({
    companyName,
    currency,
    title: t('heldSales.title'),
    subtitle: t(DATE_RANGES.find((r) => r.value === dateRange)?.label ?? 'range.all'),
    primaryColumnLabel: t('common.location'),
    secondaryColumnLabel: t('common.cashier'),
    rows: items.map((item) => ({
      timestamp: item.timestamp,
      primaryLabel: item.locationName,
      secondaryLabel: `${item.cashierName} · ${t('sales.itemsCount').replace('{n}', String(item.itemCount))}`,
      total: item.total,
    })),
  });

  const onShare = () => {
    shareList(toListData()).catch((err) => showAlert(t('common.shareFailed'), err instanceof Error ? err.message : t('common.somethingWrong')));
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.heldSalesHistory')}</Text>
          <Pressable onPress={onShare} hitSlop={8} disabled={items.length === 0} accessibilityLabel={t('common.sharePdf')}>
            <Ionicons name="share-outline" size={20} color={items.length > 0 ? colors.primary : colors.iconMuted} />
          </Pressable>
        </View>

        <FiltersDisclosure active={dateRange !== 'week'}>
          <View className="flex-row flex-wrap gap-2">
            {DATE_RANGES.map((r) => (
              <FilterChip key={r.value} label={t(r.label)} active={dateRange === r.value} onPress={() => setDateRange(r.value)} />
            ))}
          </View>
        </FiltersDisclosure>
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshing={false}
          onRefresh={load}
          renderItem={({ item }) => (
            <View className="rounded-2xl bg-surface p-4 shadow-sm shadow-black/5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">{item.locationName}</Text>
                <Text className="text-base font-bold text-primary">{formatCurrency(item.total, currency)}</Text>
              </View>
              <Text className="mt-1 text-xs text-text-secondary">
                {item.cashierName} · {t('sales.itemsCount').replace('{n}', String(item.itemCount))} · {new Date(item.timestamp).toLocaleString(appLocale())}
              </Text>
              <Pressable
                onPress={() => onDiscard(item)}
                className="mt-2 flex-row items-center gap-1 self-start rounded-lg px-2 py-1"
                hitSlop={8}>
                <Ionicons name="trash-outline" size={14} color={colors.error} />
                <Text className="text-xs font-semibold text-error">{t('heldHistory.discard')}</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-sm text-text-secondary">{t('heldHistory.empty')}</Text>
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
