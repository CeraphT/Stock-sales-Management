import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { ApiError } from '@/lib/api/client';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function SupplierReturnScreen() {
  const { productId, batchId, batchNumber, available } = useLocalSearchParams<{
    productId: string;
    batchId: string;
    batchNumber?: string;
    available?: string;
  }>();
  const companyId = useAuthStore((s) => s.companyId);
  const availableQty = Number(available ?? '0');
  const { t } = useTranslation();

  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !productId || !batchId) return;
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) {
      showAlert(t('common.invalidQuantity'), t('return.invalidQtyBody'));
      return;
    }
    if (availableQty > 0 && q > availableQty) {
      showAlert(t('return.tooMany'), t('return.tooManyBody').replace('{n}', String(availableQty)));
      return;
    }
    setSubmitting(true);
    try {
      await productsApi.supplierReturn(companyId, productId, {
        batchId,
        quantityInBaseUnits: q,
        reason: reason.trim() || null,
      });
      await syncNow();
      router.back();
    } catch (err) {
      showAlert(t('return.failed'), err instanceof ApiError ? err.message : t('common.somethingWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('product.returnToSupplier')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <KeyboardAwareScroll contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {batchNumber ? (
          <Text className="text-sm text-text-secondary">
            {t('common.batch')} {batchNumber}{availableQty > 0 ? ` · ${t('catalog.inStockCount').replace('{n}', String(availableQty))}` : ''}
          </Text>
        ) : null}
        <TextField
          label={t('return.qtyLabel')}
          placeholder="0"
          keyboardType="numeric"
          value={qty}
          onChangeText={setQty}
        />
        <TextField
          label={t('return.reason')}
          placeholder={t('return.reasonPlaceholder')}
          value={reason}
          onChangeText={setReason}
        />
        <Button title={submitting ? t('return.returning') : t('product.returnToSupplier')} loading={submitting} onPress={onSubmit} />
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
