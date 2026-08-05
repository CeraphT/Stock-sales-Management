import { Ionicons } from '@expo/vector-icons';
import { and, asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { ScreenBackground } from '@/components/ScreenBackground';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { useAuthStore } from '@/lib/auth/store';
import { db } from '@/lib/db/client';
import { batches, categories, products } from '@/lib/db/schema';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';

type StockFilter = 'all' | 'low' | 'out' | 'expiring';

// A batch counts as "expiring soon" if it still has stock and expires within
// this window — the mobile equivalent of the dashboard's expiring-soon count.
const EXPIRING_SOON_DAYS = 30;

export default function CatalogScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  // Deep-link from the dashboard stat cards: ?stock=low|out|expiring pre-applies
  // the matching filter. Runs on the param (not just mount) since Catalog is a
  // persistent tab.
  const { stock: stockParam } = useLocalSearchParams<{ stock?: string }>();
  useEffect(() => {
    if (stockParam === 'low' || stockParam === 'out' || stockParam === 'expiring') setStockFilter(stockParam);
  }, [stockParam]);

  // Archived products stay in the local mirror (needed for historical
  // sale references) but live in their own screen (Catalog → Archive) —
  // hidden here so they don't look like ordinary, sellable products.
  //
  // All three queries are scoped to the current company. The local SQLite
  // mirror can end up holding rows from a company no longer signed in on
  // this device (e.g. a device previously used for a different business) —
  // without this filter, this screen silently showed that other company's
  // entire catalog while every other local query (e.g. POS search) was
  // already correctly scoped, confirmed on-device via a direct SQLite
  // inspection.
  const { data: productRows } = useLiveQuery(
    db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.companyId, companyId ?? '')))
      .orderBy(asc(products.name)),
    [companyId],
  );
  const { data: categoryRows } = useLiveQuery(
    db.select().from(categories).where(eq(categories.companyId, companyId ?? '')),
    [companyId],
  );
  const { data: batchRows } = useLiveQuery(
    db
      .select({
        id: batches.id,
        productId: batches.productId,
        locationId: batches.locationId,
        quantityInBaseUnits: batches.quantityInBaseUnits,
        expiryDate: batches.expiryDate,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(eq(products.companyId, companyId ?? '')),
    [companyId],
  );

  const runSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await syncNow();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    runSync();
    // Only re-sync when the scope itself changes — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, locationId]);

  const categoryNameById = new Map((categoryRows ?? []).map((c) => [c.id, c.name]));
  const stockByProductId = new Map<string, number>();
  for (const b of batchRows ?? []) {
    stockByProductId.set(b.productId, (stockByProductId.get(b.productId) ?? 0) + b.quantityInBaseUnits);
  }
  const expiringCutoff = Date.now() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  const expiringProductIds = new Set<string>();
  for (const b of batchRows ?? []) {
    if (b.quantityInBaseUnits > 0 && b.expiryDate) {
      const exp = new Date(b.expiryDate).getTime();
      if (!Number.isNaN(exp) && exp <= expiringCutoff) expiringProductIds.add(b.productId);
    }
  }

  const filteredProducts = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return (productRows ?? []).filter((item) => {
      if (trimmedQuery) {
        const matchesName = item.name.toLowerCase().includes(trimmedQuery);
        const matchesBarcode = item.barcode?.toLowerCase().includes(trimmedQuery) ?? false;
        if (!matchesName && !matchesBarcode) return false;
      }
      if (categoryId && item.categoryId !== categoryId) return false;
      if (stockFilter !== 'all') {
        const stock = stockByProductId.get(item.id) ?? 0;
        if (stockFilter === 'out' && stock > 0) return false;
        if (stockFilter === 'low' && !(stock > 0 && item.lowStockThreshold > 0 && stock <= item.lowStockThreshold)) return false;
        if (stockFilter === 'expiring' && !expiringProductIds.has(item.id)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows, query, categoryId, stockFilter, batchRows]);

  const hasActiveFilters = query.trim() !== '' || categoryId !== null || stockFilter !== 'all';

  return (
    <View className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="mb-1 flex-row items-center justify-end">
          <Pressable
            onPress={() => router.push('/add-product')}
            accessibilityLabel="Add product"
            className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-90">
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text className="text-2xl font-bold text-text-primary">Products</Text>
        <Text className="text-sm text-text-secondary">
          {syncing ? 'Syncing…' : syncError ? syncError : `${filteredProducts.length} of ${productRows?.length ?? 0} products`}
        </Text>

        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search name or barcode"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />

        <FiltersDisclosure active={stockFilter !== 'all' || categoryId !== null}>
          <View className="flex-row flex-wrap gap-2">
            <FilterChip label="All stock" active={stockFilter === 'all'} onPress={() => setStockFilter('all')} />
            <FilterChip label="Low stock" active={stockFilter === 'low'} onPress={() => setStockFilter('low')} />
            <FilterChip label="Out of stock" active={stockFilter === 'out'} onPress={() => setStockFilter('out')} />
            <FilterChip label="Expiring" active={stockFilter === 'expiring'} onPress={() => setStockFilter('expiring')} />
          </View>

          {(categoryRows ?? []).length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              <FilterChip label="All categories" active={categoryId === null} onPress={() => setCategoryId(null)} />
              {(categoryRows ?? []).map((c) => (
                <FilterChip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </View>
          ) : null}
        </FiltersDisclosure>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 p-4"
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={runSync} />}
        renderItem={({ item }) => {
          const stock = stockByProductId.get(item.id) ?? 0;
          const categoryName = item.categoryId ? categoryNameById.get(item.categoryId) : null;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/product-detail', params: { id: item.id } })}
              className="rounded-2xl bg-surface p-4 shadow-sm shadow-black/5 active:opacity-80">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-text-primary">{item.name}</Text>
                  {categoryName ? <Text className="text-xs text-text-secondary">{categoryName}</Text> : null}
                  {item.barcode ? (
                    <Text className="text-xs text-text-secondary">Barcode: {item.barcode}</Text>
                  ) : null}
                </View>
                <View className="items-end">
                  <Text className="text-base font-bold text-primary">{formatCurrency(item.salePrice, currency)}</Text>
                  <Text
                    className={
                      stock <= 0
                        ? 'text-xs font-semibold text-error'
                        : item.lowStockThreshold > 0 && stock <= item.lowStockThreshold
                          ? 'text-xs font-semibold text-accent-amber'
                          : 'text-xs text-text-secondary'
                    }>
                    {stock} in stock
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-sm text-text-secondary">
              {syncing ? 'Loading products…' : hasActiveFilters ? 'No products match these filters.' : 'No products yet.'}
            </Text>
          </View>
        }
      />
    </View>
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
