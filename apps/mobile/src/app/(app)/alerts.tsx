import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import type { ExpiryAlertItem, StockAlertItem } from '@/lib/api/types/catalog';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function AlertsScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { t } = useTranslation();

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
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.alerts')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <KeyboardAwareScroll contentContainerClassName="gap-5 p-5">
        {isLoading ? (
          <Text className="py-10 text-center text-sm text-text-secondary">{t('common.loading')}</Text>
        ) : total === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">✅ {t('alerts.nothing')}</Text>
        ) : (
          <>
            <StockSection title={`⛔ ${t('stockHealth.outOfStock')}`} items={data!.outOfStock} tone="error" />
            <StockSection title={`⚠️ ${t('stockHealth.lowStock')}`} items={data!.lowStock} tone="warn" showThreshold />
            <ExpirySection title={`⏰ ${t('inventory.expired')}`} items={data!.expired} tone="error" />
            <ExpirySection title={`⏳ ${t('dashboard.expiringSoon')}`} items={data!.expiringSoon} tone="warn" />
          </>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function StockSection({ title, items, tone, showThreshold }: { title: string; items: StockAlertItem[]; tone: 'error' | 'warn'; showThreshold?: boolean }) {
  const { t } = useTranslation();
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
                {onOrder ? <Text className="text-xs text-text-secondary">🧾 {t('alerts.onOrderHint')}</Text> : null}
              </View>
              {onOrder ? (
                <Text className="text-xs font-semibold text-primary">{t('alerts.onOrder')}</Text>
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
  const { t } = useTranslation();
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
              <Text className="text-xs text-text-secondary">{t('common.batch')} {b.batchNumber} · {b.expiryDate.slice(0, 10)} · {b.quantityInBaseUnits} {t('common.units')}</Text>
            </View>
            <Text className={`text-xs font-semibold ${tone === 'error' ? 'text-error' : 'text-accent-amber'}`}>
              {b.daysUntilExpiry < 0 ? t('alerts.daysAgo').replace('{n}', String(-b.daysUntilExpiry)) : t('po.daysShort').replace('{n}', String(b.daysUntilExpiry))}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
