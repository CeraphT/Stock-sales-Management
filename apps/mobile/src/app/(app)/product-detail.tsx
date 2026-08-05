import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { PackagingLevelsEditor, parsePackagingLevels, type DraftPackagingLevel } from '@/components/PackagingLevelsEditor';
import { SkeletonDetail } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { PurchaseOrderStatus } from '@/lib/api/enums';
import { productsApi } from '@/lib/api/endpoints/products';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import type { BatchResponse, ProductDetailResponse } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const [reordering, setReordering] = useState(false);

  // One-click reorder → one PO per supplier: if this product's supplier already
  // has an open (Pending) order, add a line to it; otherwise start a new draft.
  // Mirrors desktop's Products.orderFromSupplier consolidation.
  async function onReorder() {
    if (!companyId || !locationId || !product || reordering) return;
    if (!product.supplierId) {
      showAlert('No supplier', 'Add a supplier to this product first, then reorder.');
      return;
    }
    setReordering(true);
    try {
      const line = { productId: product.id, quantityOrdered: Math.max(product.lowStockThreshold, 1), unitCost: product.purchasePrice };
      const openPos = await purchaseOrdersApi.list(companyId, { supplierId: product.supplierId, status: PurchaseOrderStatus.Pending });
      if (openPos.length > 0) {
        await purchaseOrdersApi.addLine(companyId, openPos[0].id, line);
        toast('Added to the existing order for this supplier.', 'success');
        router.push({ pathname: '/purchase-order-detail', params: { id: openPos[0].id } });
      } else {
        const po = await purchaseOrdersApi.create(companyId, { locationId, supplierId: product.supplierId, notes: 'Reorder — low stock', lines: [line] });
        router.push({ pathname: '/purchase-order-detail', params: { id: po.id } });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the order.', 'error');
    } finally {
      setReordering(false);
    }
  }

  const [product, setProduct] = useState<ProductDetailResponse | null>(null);
  const [batches, setBatches] = useState<BatchResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [packagingLevels, setPackagingLevels] = useState<DraftPackagingLevel[]>([]);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !id) return;
    setLoading(true);
    try {
      const [productResult, batchesResult] = await Promise.all([
        productsApi.get(companyId, id),
        productsApi.batches(companyId, id),
      ]);
      setProduct(productResult);
      setName(productResult.name);
      setBarcode(productResult.barcode ?? '');
      setPurchasePrice(String(productResult.purchasePrice));
      setSalePrice(String(productResult.salePrice));
      setLowStockThreshold(String(productResult.lowStockThreshold));
      setPackagingLevels(
        productResult.packagingLevels.map((l) => ({
          unitName: l.unitName,
          quantityInBaseUnits: String(l.quantityInBaseUnits),
          salePriceOverride: l.salePriceOverride != null ? String(l.salePriceOverride) : '',
        })),
      );
      setBatches(batchesResult.sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')));
    } catch (err) {
      showAlert('Could not load product', err instanceof Error ? err.message : 'Something went wrong.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [companyId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSave = async () => {
    if (!companyId || !id || !product) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a product name.');
      return;
    }
    const parsedLevels = parsePackagingLevels(packagingLevels);
    if (!parsedLevels.ok) {
      showAlert('Invalid packaging level', parsedLevels.message);
      return;
    }
    setSaving(true);
    try {
      await productsApi.update(companyId, id, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId: product.categoryId,
        supplierId: product.supplierId,
        purchasePrice: Number(purchasePrice || '0'),
        salePrice: Number(salePrice || '0'),
        lowStockThreshold: Number(lowStockThreshold || '0'),
        taxRateOverridePercent: product.taxRateOverridePercent,
        isFavorite: product.isFavorite,
        // The API replaces the whole packaging-level list by name on every
        // save, so this always sends the full current (edited) list, never
        // a partial diff — see PackagingLevelsEditor's own note.
        packagingLevels: parsedLevels.value,
      });
      await syncNow();
      await load();
      showAlert('Saved', 'Product updated.');
    } catch (err) {
      showAlert('Could not save', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleArchive = async () => {
    if (!companyId || !id || !product) return;
    setArchiving(true);
    try {
      if (product.isActive) {
        await productsApi.archive(companyId, id);
      } else {
        await productsApi.restore(companyId, id);
      }
      await syncNow();
      await load();
    } catch (err) {
      showAlert('Could not update', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setArchiving(false);
    }
  };

  if (loading || !product) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScreenBackground />
        <SkeletonDetail />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Product</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {!product.isActive ? (
          <View className="rounded-xl bg-error/10 px-4 py-3">
            <Text className="text-sm font-semibold text-error">This product is archived.</Text>
          </View>
        ) : null}

        <TextField label="Product name" value={name} onChangeText={setName} />
        <TextField label="Barcode" autoCapitalize="none" value={barcode} onChangeText={setBarcode} />
        {product.categoryName ? (
          <Text className="text-xs text-text-secondary">Category: {product.categoryName}</Text>
        ) : null}
        <TextField label={`Purchase price (${currency})`} keyboardType="numeric" value={purchasePrice} onChangeText={setPurchasePrice} />
        <TextField label={`Sale price (${currency})`} keyboardType="numeric" value={salePrice} onChangeText={setSalePrice} />
        <TextField
          label="Low stock threshold"
          keyboardType="numeric"
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
        />

        <PackagingLevelsEditor levels={packagingLevels} onChange={setPackagingLevels} currency={currency} />

        <Button title={saving ? 'Saving…' : 'Save changes'} loading={saving} onPress={onSave} />
        <Button title="🛒  Reorder from supplier" variant="secondary" loading={reordering} onPress={onReorder} />
        <Button
          title={product.isActive ? 'Archive product' : 'Restore product'}
          variant="secondary"
          loading={archiving}
          onPress={onToggleArchive}
        />

        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-sm font-bold text-text-primary">Batches</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/stock-receive', params: { productId: id } })}
            className="rounded-lg bg-primary px-3 py-2">
            <Text className="text-xs font-semibold text-white">Receive stock</Text>
          </Pressable>
        </View>

        {batches.length === 0 ? (
          <Text className="text-sm text-text-secondary">No batches received yet.</Text>
        ) : (
          batches.map((batch) => (
            <View key={batch.id} className="rounded-xl bg-surface p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">{batch.batchNumber}</Text>
                <Text className="text-sm font-bold text-text-primary">{batch.quantityInBaseUnits} units</Text>
              </View>
              <Text className="text-xs text-text-secondary">
                {batch.expiryDate ? `Expires ${batch.expiryDate.slice(0, 10)}` : 'No expiry'} · Cost{' '}
                {formatCurrency(batch.purchasePricePerBaseUnit, currency)}
              </Text>
              <Pressable
                onPress={() => router.push({ pathname: '/stock-adjust', params: { productId: id, batchId: batch.id } })}
                className="mt-2 self-start rounded-lg border border-primary px-3 py-1.5">
                <Text className="text-xs font-semibold text-primary">Adjust</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
