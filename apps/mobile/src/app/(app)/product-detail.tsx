import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { reorderQuantity } from '@stockflow/core/purchasing/reorder';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { PackagingLevelsEditor, parsePackagingLevels, type DraftPackagingLevel } from '@/components/PackagingLevelsEditor';
import { SkeletonDetail } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { PurchaseOrderStatus } from '@/lib/api/enums';
import { NetworkError } from '@/lib/api/client';
import { productsApi } from '@/lib/api/endpoints/products';
import { localMirrorQueries } from '@stockflow/core/local/mirrorQueries';
import { OfflineNotice } from '@/components/OfflineNotice';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { useTranslation } from '@/lib/i18n/useTranslation';
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
  const { t } = useTranslation();
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const [reordering, setReordering] = useState(false);

  // One-click reorder → one PO per supplier: if this product's supplier already
  // has an open (Pending) order, add a line to it; otherwise start a new draft.
  // Mirrors desktop's Products.orderFromSupplier consolidation.
  async function onReorder() {
    if (!companyId || !locationId || !product || reordering) return;
    if (!product.supplierId) {
      showAlert(t('product.noSupplier'), t('product.noSupplierBody'));
      return;
    }
    setReordering(true);
    try {
      const line = { productId: product.id, quantityOrdered: reorderQuantity(product.lowStockThreshold, batches.reduce((s, b) => s + b.quantityInBaseUnits, 0)), unitCost: product.purchasePrice };
      const openPos = await purchaseOrdersApi.list(companyId, { supplierId: product.supplierId, status: PurchaseOrderStatus.Pending });
      if (openPos.length > 0) {
        await purchaseOrdersApi.addLine(companyId, openPos[0].id, line);
        toast(t('product.addedToOrder'), 'success');
        router.push({ pathname: '/purchase-order-detail', params: { id: openPos[0].id } });
      } else {
        const po = await purchaseOrdersApi.create(companyId, { locationId, supplierId: product.supplierId, notes: t('product.reorderNote'), lines: [line] });
        router.push({ pathname: '/purchase-order-detail', params: { id: po.id } });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('product.orderFailed'), 'error');
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

  // Offline-first: the product + its batches are in the local mirror, shown at
  // once; the server answer then replaces them. The edit form is only refilled
  // from the server if the user hasn't started typing (snapshot comparison).
  const [offline, setOffline] = useState(false);
  const formSnapshot = useRef<string | null>(null);
  // Current form values, refreshed every render (load() is memoized, so it must
  // read them through a ref, not its stale closure).
  const formNow = useRef('');
  formNow.current = JSON.stringify([name, barcode, purchasePrice, salePrice, lowStockThreshold, packagingLevels]);

  const fillForm = (p: ProductDetailResponse) => {
    const levels = p.packagingLevels.map((l) => ({
      unitName: l.unitName,
      quantityInBaseUnits: String(l.quantityInBaseUnits),
      salePriceOverride: l.salePriceOverride != null ? String(l.salePriceOverride) : '',
    }));
    setName(p.name);
    setBarcode(p.barcode ?? '');
    setPurchasePrice(String(p.purchasePrice));
    setSalePrice(String(p.salePrice));
    setLowStockThreshold(String(p.lowStockThreshold));
    setPackagingLevels(levels);
    formSnapshot.current = JSON.stringify([p.name, p.barcode ?? '', String(p.purchasePrice), String(p.salePrice), String(p.lowStockThreshold), levels]);
  };
  const sortBatches = (rows: BatchResponse[]) => rows.sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'));

  const load = useCallback(async () => {
    if (!companyId || !id) {
      setLoading(false);
      return;
    }
    let hadLocal = false;
    try {
      const [p, b] = await Promise.all([localMirrorQueries.getProductDetail(companyId, id), localMirrorQueries.listProductBatches(companyId, id)]);
      setProduct(p);
      fillForm(p);
      setBatches(sortBatches(b));
      hadLocal = true;
      setLoading(false);
    } catch {
      setLoading(true);
    }
    try {
      const [productResult, batchesResult] = await Promise.all([
        productsApi.get(companyId, id),
        productsApi.batches(companyId, id),
      ]);
      setProduct(productResult);
      // Don't clobber edits made while the server answer was in flight.
      if (!hadLocal || formNow.current === formSnapshot.current) fillForm(productResult);
      setBatches(sortBatches(batchesResult));
      setOffline(false);
    } catch (err) {
      if (err instanceof NetworkError && hadLocal) {
        setOffline(true);
      } else {
        showAlert(t('product.loadFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
        if (!hadLocal) router.back();
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSave = async () => {
    if (!companyId || !id || !product) return;
    if (!name.trim()) {
      showAlert(t('product.missingName'), t('product.missingNameBody'));
      return;
    }
    const parsedLevels = parsePackagingLevels(packagingLevels);
    if (!parsedLevels.ok) {
      showAlert(t('packaging.invalid'), parsedLevels.message);
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
      showAlert(t('product.saved'), t('product.updated'));
    } catch (err) {
      showAlert(t('common.saveFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
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
      showAlert(t('recon.updateFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
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
          <Text className="text-lg font-bold text-text-primary">{t('tax.col.product')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <OfflineNotice visible={offline} message={t('offline.productDetail')} />
      <KeyboardAwareScroll contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {!product.isActive ? (
          <View className="rounded-xl bg-error/10 px-4 py-3">
            <Text className="text-sm font-semibold text-error">{t('product.archivedNotice')}</Text>
          </View>
        ) : null}

        <TextField label={t('product.name')} value={name} onChangeText={setName} />
        <TextField label={t('product.barcode')} autoCapitalize="none" value={barcode} onChangeText={setBarcode} />
        {product.categoryName ? (
          <Text className="text-xs text-text-secondary">{t('product.categoryLine').replace('{name}', product.categoryName)}</Text>
        ) : null}
        <TextField label={t('product.purchasePrice').replace('{currency}', currency)} keyboardType="numeric" value={purchasePrice} onChangeText={setPurchasePrice} />
        <TextField label={t('product.salePrice').replace('{currency}', currency)} keyboardType="numeric" value={salePrice} onChangeText={setSalePrice} />
        <TextField
          label={t('product.lowStockThreshold')}
          keyboardType="numeric"
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
        />

        <PackagingLevelsEditor levels={packagingLevels} onChange={setPackagingLevels} currency={currency} />

        <Button title={saving ? t('common.saving') : t('common.saveChanges')} loading={saving} onPress={onSave} />
        <Button title={`🛒  ${t('product.reorder')}`} variant="secondary" loading={reordering} onPress={onReorder} />
        <Button
          title={product.isActive ? t('product.archive') : t('product.restore')}
          variant="secondary"
          loading={archiving}
          onPress={onToggleArchive}
        />

        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-sm font-bold text-text-primary">{t('product.batches')}</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/stock-receive', params: { productId: id } })}
            className="rounded-lg bg-primary px-3 py-2">
            <Text className="text-xs font-semibold text-white">{t('drawer.item.receiveStock')}</Text>
          </Pressable>
        </View>

        {batches.length === 0 ? (
          <Text className="text-sm text-text-secondary">{t('product.noBatches')}</Text>
        ) : (
          batches.map((batch) => (
            <View key={batch.id} className="rounded-xl bg-surface p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">{batch.batchNumber}</Text>
                <Text className="text-sm font-bold text-text-primary">{batch.quantityInBaseUnits} {t('common.units')}</Text>
              </View>
              <Text className="text-xs text-text-secondary">
                {batch.expiryDate ? t('product.expires').replace('{date}', batch.expiryDate.slice(0, 10)) : t('product.noExpiry')} · {t('product.cost')}{' '}
                {formatCurrency(batch.purchasePricePerBaseUnit, currency)}
              </Text>
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  onPress={() => router.push({ pathname: '/stock-adjust', params: { productId: id, batchId: batch.id } })}
                  className="self-start rounded-lg border border-primary px-3 py-1.5">
                  <Text className="text-xs font-semibold text-primary">{t('recon.adjust')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/supplier-return' as never, params: { productId: id, batchId: batch.id, batchNumber: batch.batchNumber, available: String(batch.quantityInBaseUnits) } })}
                  className="self-start rounded-lg border border-border px-3 py-1.5">
                  <Text className="text-xs font-semibold text-text-secondary">{t('product.returnToSupplier')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
