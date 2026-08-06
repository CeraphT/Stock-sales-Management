import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useAuthStore } from '@/lib/auth/store';
import { cartTotal, useCartStore, type CartLine } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { localSalesService } from '@/lib/local/salesService';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';
import type { ProductSearchResult } from '@/lib/api/types/catalog';

export default function PosScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const lines = useCartStore((s) => s.lines);
  const serviceLines = useCartStore((s) => s.serviceLines);
  const customerId = useCartStore((s) => s.customerId);
  const customerName = useCartStore((s) => s.customerName);
  const addLine = useCartStore((s) => s.addLine);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const updateServiceQuantity = useCartStore((s) => s.updateServiceQuantity);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const clearCart = useCartStore((s) => s.clear);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [holding, setHolding] = useState(false);
  const [measurePick, setMeasurePick] = useState<ProductSearchResult | null>(null);
  const [measureQty, setMeasureQty] = useState('');

  const total = cartTotal(lines, serviceLines);
  const cartItems = [
    ...lines.map((line) => ({ kind: 'product' as const, key: line.key, line })),
    ...serviceLines.map((line) => ({ kind: 'service' as const, key: line.key, line })),
  ];

  const runSearch = async (text: string) => {
    setQuery(text);
    if (!companyId || !text.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await localCatalogQueryService.searchProducts(companyId, text.trim()));
    } finally {
      setSearching(false);
    }
  };

  const addProductToCart = (product: ProductSearchResult, level?: ProductSearchResult['packagingLevels'][number]) => {
    const line: Omit<CartLine, 'quantity'> = level
      ? {
          key: `${product.productId}:${level.id}`,
          productId: product.productId,
          productName: product.name,
          packagingLevelId: level.id,
          packagingLevelName: level.unitName,
          unitPrice: level.unitPrice,
        }
      : {
          key: `${product.productId}:base`,
          productId: product.productId,
          productName: product.name,
          packagingLevelId: null,
          packagingLevelName: null,
          unitPrice: product.salePrice,
        };
    addLine(line);
  };

  // Sell-by-measure: the weighed amount is entered in the display unit (e.g. kg)
  // and stored as whole base units (grams) — same integer ledger as everything else.
  const addMeasure = (product: ProductSearchResult, displayQty: number) => {
    const upm = product.unitsPerMeasure && product.unitsPerMeasure > 0 ? product.unitsPerMeasure : 1;
    const baseUnits = Math.round(displayQty * upm);
    if (baseUnits <= 0) return;
    const key = `${product.productId}:measure`;
    addLine({
      key,
      productId: product.productId,
      productName: product.name,
      packagingLevelId: null,
      packagingLevelName: null,
      unitPrice: product.salePrice,
      measureUnit: product.measureUnit,
      unitsPerMeasure: upm,
    });
    updateQuantity(key, baseUnits);
    setMeasurePick(null);
    setMeasureQty('');
  };

  const onHold = async () => {
    if (!companyId || !locationId || lines.length === 0) return;
    setHolding(true);
    try {
      await localSalesService.holdSale(companyId, {
        locationId,
        customerId,
        productLines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, packagingLevelId: l.packagingLevelId })),
      });
      clearCart();
      router.replace('/dashboard');
    } catch (err) {
      showAlert('Could not hold sale', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setHolding(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-center">
          <Text className="text-lg font-bold text-text-primary">{t('pos.title')}</Text>
        </View>

        <View className="mt-3 flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
            placeholder={t('pos.searchPlaceholder')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={runSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          <Pressable
            onPress={() => router.push('/scanner')}
            accessibilityLabel="Scan barcode"
            className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:opacity-90">
            <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {query.trim() ? (
        <View className="max-h-64 border-b border-border">
          {searching ? (
            <ActivityIndicator className="py-4" />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.productId}
              contentContainerClassName="p-3 gap-2"
              renderItem={({ item }) => (
                <View className="rounded-xl bg-surface p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm font-semibold text-text-primary">{item.name}</Text>
                    <Text className="text-sm font-bold text-primary">{formatCurrency(item.salePrice, currency)}</Text>
                  </View>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {item.sellByMeasure ? (
                      <Pressable
                        disabled={item.stockStatus === 'out_of_stock'}
                        onPress={() => { setMeasurePick(item); setMeasureQty(''); }}
                        className={`rounded-lg px-3 py-1.5 ${item.stockStatus === 'out_of_stock' ? 'bg-border' : 'bg-primary'}`}>
                        <Text className="text-xs font-semibold text-white">
                          {item.stockStatus === 'out_of_stock' ? t('pos.outOfStock') : `⚖️ ${formatCurrency(item.salePrice * (item.unitsPerMeasure || 1), currency)}/${item.measureUnit}`}
                        </Text>
                      </Pressable>
                    ) : (
                      <>
                        <Pressable
                          disabled={item.stockStatus === 'out_of_stock'}
                          onPress={() => addProductToCart(item)}
                          className={`rounded-lg px-3 py-1.5 ${item.stockStatus === 'out_of_stock' ? 'bg-border' : 'bg-primary'}`}>
                          <Text className="text-xs font-semibold text-white">
                            {item.stockStatus === 'out_of_stock' ? t('pos.outOfStock') : t('pos.addUnit')}
                          </Text>
                        </Pressable>
                        {item.packagingLevels.map((level) => (
                          <Pressable
                            key={level.id}
                            disabled={item.stockStatus === 'out_of_stock'}
                            onPress={() => addProductToCart(item, level)}
                            className="rounded-lg border border-primary px-3 py-1.5">
                            <Text className="text-xs font-semibold text-primary">
                              {level.unitName} · {formatCurrency(level.unitPrice, currency)}
                            </Text>
                          </Pressable>
                        ))}
                      </>
                    )}
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text className="p-4 text-center text-sm text-text-secondary">{t('pos.noResults')}</Text>}
            />
          )}
        </View>
      ) : null}

      <View className="mx-4 mt-3">
        <Pressable
          onPress={() => router.push('/customer-picker')}
          className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
          <Text className="text-sm text-text-secondary">{t('pos.customer')}</Text>
          <Text className="text-sm font-semibold text-text-primary">{customerName ?? t('common.walkIn')}</Text>
        </Pressable>
      </View>

      <FlatList
        className="flex-1"
        data={cartItems}
        keyExtractor={(item) => item.key}
        contentContainerClassName="gap-2 p-4"
        renderItem={({ item }) =>
          item.kind === 'product' ? (
            <View className="flex-row items-center justify-between rounded-xl bg-surface p-3">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-text-primary">{item.line.productName}</Text>
                <Text className="text-xs text-text-secondary">
                  {item.line.measureUnit
                    ? `${formatCurrency(item.line.unitPrice * (item.line.unitsPerMeasure || 1), currency)}/${item.line.measureUnit}`
                    : `${item.line.packagingLevelName ?? 'Unit'} · ${formatCurrency(item.line.unitPrice, currency)} each`}
                </Text>
              </View>
              {item.line.measureUnit ? (
                <View className="flex-row items-center gap-3">
                  <Text className="text-base font-semibold text-text-primary">
                    {item.line.quantity / (item.line.unitsPerMeasure || 1)} {item.line.measureUnit}
                  </Text>
                  <Pressable
                    onPress={() => updateQuantity(item.key, 0)}
                    className="h-8 w-8 items-center justify-center rounded-lg border border-border">
                    <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => updateQuantity(item.key, item.line.quantity - 1)}
                    className="h-8 w-8 items-center justify-center rounded-lg border border-border">
                    <Text className="text-base font-bold text-text-primary">−</Text>
                  </Pressable>
                  <Text className="w-6 text-center text-base font-semibold text-text-primary">{item.line.quantity}</Text>
                  <Pressable
                    onPress={() => updateQuantity(item.key, item.line.quantity + 1)}
                    className="h-8 w-8 items-center justify-center rounded-lg border border-border">
                    <Text className="text-base font-bold text-text-primary">+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View className="flex-row items-center justify-between rounded-xl bg-accent-purple-soft p-3">
              <View className="flex-1 pr-2">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="medkit-outline" size={12} color={colors.accentPurple} />
                  <Text className="text-sm font-semibold text-text-primary">{item.line.serviceName}</Text>
                </View>
                <Text className="text-xs text-text-secondary">{formatCurrency(item.line.unitPrice, currency)} each</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => updateServiceQuantity(item.key, item.line.quantity - 1)}
                  className="h-8 w-8 items-center justify-center rounded-lg border border-border">
                  <Text className="text-base font-bold text-text-primary">−</Text>
                </Pressable>
                <Text className="w-6 text-center text-base font-semibold text-text-primary">{item.line.quantity}</Text>
                <Pressable
                  onPress={() => updateServiceQuantity(item.key, item.line.quantity + 1)}
                  className="h-8 w-8 items-center justify-center rounded-lg border border-border">
                  <Text className="text-base font-bold text-text-primary">+</Text>
                </Pressable>
              </View>
            </View>
          )
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-sm text-text-secondary">{t('pos.emptyCart')}</Text>
          </View>
        }
      />

      {serviceLines.length > 0 ? (
        <Text className="px-4 text-xs text-text-secondary">Sales with services need an internet connection to complete.</Text>
      ) : null}

      <View className="gap-3 border-t border-border bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-text-secondary">{t('common.total')}</Text>
          <Text className="text-xl font-bold text-text-primary">{formatCurrency(total, currency)}</Text>
        </View>
        <View className="flex-row gap-3">
          <Pressable
            disabled={lines.length === 0 || serviceLines.length > 0 || holding}
            onPress={onHold}
            className="flex-1 items-center rounded-xl border border-primary py-3.5 disabled:opacity-50">
            <Text className="text-base font-semibold text-primary">{holding ? t('pos.holding') : t('pos.hold')}</Text>
          </Pressable>
          <Pressable
            disabled={lines.length === 0 && serviceLines.length === 0}
            onPress={() => router.push('/checkout')}
            className="flex-1 items-center rounded-xl bg-primary py-3.5 disabled:opacity-50">
            <Text className="text-base font-semibold text-white">{t('pos.charge')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Sell-by-measure weight entry */}
      <Modal visible={!!measurePick} transparent animationType="fade" onRequestClose={() => setMeasurePick(null)}>
        <Pressable className="flex-1 items-center justify-center bg-black/40 p-6" onPress={() => setMeasurePick(null)}>
          <Pressable className="w-full max-w-sm gap-3 rounded-2xl bg-surface p-5" onPress={(e) => e.stopPropagation()}>
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">⚖️ {t('pos.enterWeight')}</Text>
            <Text className="text-lg font-bold text-text-primary">{measurePick?.name}</Text>
            {measurePick ? (
              <Text className="text-sm text-text-secondary">
                {formatCurrency(measurePick.salePrice * (measurePick.unitsPerMeasure || 1), currency)}/{measurePick.measureUnit}
              </Text>
            ) : null}
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-lg text-text-primary"
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
                autoFocus
                value={measureQty}
                onChangeText={setMeasureQty}
              />
              <Text className="text-lg font-semibold text-text-secondary">{measurePick?.measureUnit}</Text>
            </View>
            {Number(measureQty) > 0 && measurePick ? (
              <Text className="text-sm text-text-secondary">
                {t('common.total')}:{' '}
                <Text className="font-bold text-text-primary">
                  {formatCurrency(measurePick.salePrice * (measurePick.unitsPerMeasure || 1) * Number(measureQty), currency)}
                </Text>
              </Text>
            ) : null}
            <View className="mt-1 flex-row gap-3">
              <Pressable onPress={() => setMeasurePick(null)} className="flex-1 items-center rounded-xl border border-border py-3">
                <Text className="text-base font-semibold text-text-primary">{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={!(Number(measureQty) > 0)}
                onPress={() => measurePick && addMeasure(measurePick, Number(measureQty))}
                className="flex-1 items-center rounded-xl bg-primary py-3 disabled:opacity-50">
                <Text className="text-base font-semibold text-white">{t('pos.addToCart')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
