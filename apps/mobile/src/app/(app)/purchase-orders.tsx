import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineNotice } from '@/components/OfflineNotice';
import { ScreenBackground } from '@/components/ScreenBackground';
import { cachedFetch } from '@stockflow/core/local/remoteCache';
import { useStaleNotice } from '@/lib/hooks/useStaleNotice';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { PurchaseOrderStatus } from '@/lib/api/enums';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import { suppliersApi } from '@/lib/api/endpoints/suppliers';
import type { SupplierResponse } from '@/lib/api/types/catalog';
import type { PurchaseOrderSummaryResponse } from '@/lib/api/types/purchaseOrders';
import { DateField } from '@/components/DateField';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { SkeletonList } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, purchaseOrderStatusLabelKey } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { purchaseOrderStatusTone } from '@/lib/purchaseOrderStatusTone';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { appLocale } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@stockflow/core/i18n/translations';

const STATUS_FILTERS: (PurchaseOrderStatus | 'all')[] = [
  'all',
  PurchaseOrderStatus.Pending,
  PurchaseOrderStatus.PartiallyReceived,
  PurchaseOrderStatus.Received,
  PurchaseOrderStatus.Cancelled,
];

function filterLabel(value: PurchaseOrderStatus | 'all', t: (key: TranslationKey) => string): string {
  return t(value === 'all' ? 'common.all' : purchaseOrderStatusLabelKey(value));
}

/** Whole days since an ISO timestamp — for the overdue badge (matches desktop). */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function PurchaseOrdersScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  // Offline B: server-only data — offline, the last answer is shown with its date.
  const { staleAt, setStaleAt, staleMessage } = useStaleNotice();
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allOrders, setAllOrders] = useState<PurchaseOrderSummaryResponse[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetched unfiltered once, filtered client-side — lets every status chip
  // show a live count and switching filters feel instant, no re-fetch per tap.
  // Suppliers come along so a PO's supplier can be contacted (the summary has
  // only the name, no contact details).
  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [orders, sups] = await Promise.all([
        cachedFetch(companyId, 'purchaseOrders:list', () => purchaseOrdersApi.list(companyId), setStaleAt),
        cachedFetch(companyId, 'suppliers:list', () => suppliersApi.list(companyId), setStaleAt),
      ]);
      setAllOrders(orders);
      setSuppliers(sups);
    } catch (err) {
      showAlert(t('po.loadFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const supplierByName = useMemo(() => {
    const m = new Map<string, SupplierResponse>();
    for (const s of suppliers) m.set(s.name, s);
    return m;
  }, [suppliers]);

  const onContactSupplier = (supplierName: string) => {
    const s = supplierByName.get(supplierName);
    const phone = s?.contactPhone?.trim();
    const email = s?.contactEmail?.trim();
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (phone) buttons.push({ text: `${t('suppliers.call')} ${phone}`, onPress: () => void Linking.openURL(`tel:${phone}`) });
    if (email) buttons.push({ text: `${t('suppliers.email')} ${email}`, onPress: () => void Linking.openURL(`mailto:${email}`) });
    buttons.push({ text: t('common.close'), style: 'cancel' });
    showAlert(
      supplierName,
      phone || email ? t('suppliers.contactThis') : t('po.noContact'),
      buttons,
    );
  };

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
    () =>
      allOrders.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        const day = o.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [allOrders, statusFilter, from, to],
  );

  const openCount = (counts[PurchaseOrderStatus.Pending] ?? 0) + (counts[PurchaseOrderStatus.PartiallyReceived] ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.purchaseOrders')}</Text>
          <Pressable
            onPress={() => router.push('/purchase-order-form')}
            accessibilityLabel={t('po.new')}
            className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-90">
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {!loading && openCount > 0 ? (
          <Text className="mt-2 text-xs text-text-secondary">
            {t(openCount === 1 ? 'po.awaitingOne' : 'po.awaitingMany').replace('{n}', String(openCount))}
          </Text>
        ) : null}

        <FiltersDisclosure active={statusFilter !== 'all' || !!from || !!to}>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={String(s)}
                label={`${filterLabel(s, t)} (${counts[s] ?? 0})`}
                active={statusFilter === s}
                onPress={() => setStatusFilter(s)}
              />
            ))}
          </View>
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <DateField label={t('history.from')} value={from || null} onChange={setFrom} />
            </View>
            <View className="flex-1">
              <DateField label={t('history.to')} value={to || null} onChange={setTo} />
            </View>
          </View>
          {from || to ? (
            <Pressable onPress={() => { setFrom(''); setTo(''); }} className="mt-2 self-start">
              <Text className="text-xs font-semibold text-primary">{t('po.clearDates')}</Text>
            </Pressable>
          ) : null}
        </FiltersDisclosure>
      </View>

      <OfflineNotice visible={!!staleAt} message={staleMessage} />
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
                  <View className="flex-row items-center gap-1.5">
                    {(item.status === PurchaseOrderStatus.Pending || item.status === PurchaseOrderStatus.PartiallyReceived) &&
                    daysSince(item.createdAt) > 30 ? (
                      <View className="rounded-lg bg-error/15 px-2 py-0.5">
                        <Text className="text-[11px] font-bold text-error">⏰ {t('po.daysShort').replace('{n}', String(daysSince(item.createdAt)))}</Text>
                      </View>
                    ) : null}
                    <View className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${tone.badgeClass}`}>
                      <Ionicons name={tone.icon} size={12} color={tone.iconColor} />
                      <Text className={`text-[11px] font-bold ${tone.textClass}`}>{t(purchaseOrderStatusLabelKey(item.status))}</Text>
                    </View>
                    <Pressable
                      onPress={() => onContactSupplier(item.supplierName)}
                      hitSlop={8}
                      accessibilityLabel={t('suppliers.contact')}
                      className="h-8 w-8 items-center justify-center">
                      <Ionicons name="call-outline" size={17} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
                <Text className="mt-1 text-xs text-text-secondary">
                  {item.locationName} · {t(item.lineCount === 1 ? 'po.lineOne' : 'po.lineMany').replace('{n}', String(item.lineCount))} · {formatCurrency(item.totalCost, currency)}
                </Text>
                <Text className="mt-0.5 text-xs text-text-secondary">{new Date(item.createdAt).toLocaleString(appLocale())}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-sm text-text-secondary">{t('po.emptyFilter')}</Text>
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
