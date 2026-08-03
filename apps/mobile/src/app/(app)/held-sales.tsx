import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import type { HeldSaleSummaryResponse } from '@/lib/api/types/sales';
import { useAuthStore } from '@/lib/auth/store';
import { useCartStore, type CartLine } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { localSalesService } from '@/lib/local/salesService';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function HeldSalesScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const loadLines = useCartStore((s) => s.loadLines);
  const cartHasLines = useCartStore((s) => s.lines.length > 0);

  const [items, setItems] = useState<HeldSaleSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setItems(await localSalesService.getHeldSales(companyId, locationId));
    } finally {
      setLoading(false);
    }
  }, [companyId, locationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onResume = async (saleId: string) => {
    if (!companyId) return;
    if (cartHasLines) {
      showAlert('Cart not empty', 'Clear or complete the current cart before resuming a held sale.');
      return;
    }
    try {
      const detail = await localSalesService.getSaleDetail(companyId, saleId);
      const lines: CartLine[] = detail.productLines.map((line) => ({
        key: `${line.productId}:${line.packagingLevelId ?? 'base'}`,
        productId: line.productId,
        productName: line.productName,
        packagingLevelId: line.packagingLevelId,
        packagingLevelName: line.packagingLevelName,
        unitPrice: line.unitPrice,
        quantity: Math.round(line.quantityInBaseUnits / line.unitsPerPackagingLevel),
      }));

      // Holding a sale never reserved stock — someone else may have sold
      // the last of an item while this cart sat parked. Check now, before
      // checkout, rather than letting the cashier discover it only when
      // "Charge" fails.
      const requiredBaseUnitsByProduct = new Map<string, number>();
      for (const line of detail.productLines) {
        requiredBaseUnitsByProduct.set(
          line.productId,
          (requiredBaseUnitsByProduct.get(line.productId) ?? 0) + line.quantityInBaseUnits,
        );
      }
      const shortfalls: string[] = [];
      for (const [productId, required] of requiredBaseUnitsByProduct) {
        const available = await localCatalogQueryService.getAvailableStock(productId);
        if (available < required) {
          const line = detail.productLines.find((l) => l.productId === productId);
          shortfalls.push(`${line?.productName ?? productId}: needs ${required}, only ${available} in stock`);
        }
      }

      const proceed = (): void => {
        loadLines(lines, null, null);
        router.replace('/pos');
      };

      if (shortfalls.length > 0) {
        showAlert('Stock has changed', `Some items in this held sale are no longer fully available:\n\n${shortfalls.join('\n')}`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Resume anyway',
            onPress: async () => {
              await localSalesService.deleteHeldSale(companyId, saleId);
              proceed();
            },
          },
        ]);
        return;
      }

      await localSalesService.deleteHeldSale(companyId, saleId);
      proceed();
    } catch (err) {
      showAlert('Could not resume sale', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const onDelete = (saleId: string) => {
    showAlert('Delete held sale?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!companyId) return;
          await localSalesService.deleteHeldSale(companyId, saleId);
          await refresh();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('heldSales.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 p-4"
        refreshing={loading}
        onRefresh={refresh}
        renderItem={({ item }) => (
          <Pressable onPress={() => onResume(item.id)} onLongPress={() => onDelete(item.id)} className="rounded-2xl bg-surface p-4 shadow-sm shadow-black/5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-text-primary">{item.itemCount} items</Text>
              <Text className="text-base font-bold text-primary">{formatCurrency(item.total, currency)}</Text>
            </View>
            <Text className="mt-1 text-xs text-text-secondary">
              {item.cashierName} · {new Date(item.timestamp).toLocaleString()}
            </Text>
            <Text className="mt-2 text-xs text-text-secondary">Tap to resume · hold to delete</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-16">
              <Text className="text-sm text-text-secondary">{t('heldSales.empty')}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
