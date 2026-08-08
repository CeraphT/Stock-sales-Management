import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api/client';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';

export default function SupplierReturnScreen() {
  const { productId, batchId, batchNumber, available } = useLocalSearchParams<{
    productId: string;
    batchId: string;
    batchNumber?: string;
    available?: string;
  }>();
  const companyId = useAuthStore((s) => s.companyId);
  const availableQty = Number(available ?? '0');

  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !productId || !batchId) return;
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) {
      showAlert('Invalid quantity', 'Enter a positive whole number of base units to return.');
      return;
    }
    if (availableQty > 0 && q > availableQty) {
      showAlert('Too many', `Only ${availableQty} in stock in this batch.`);
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
      showAlert('Could not return stock', err instanceof ApiError ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Return to supplier</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {batchNumber ? (
          <Text className="text-sm text-text-secondary">
            Batch {batchNumber}{availableQty > 0 ? ` · ${availableQty} in stock` : ''}
          </Text>
        ) : null}
        <TextField
          label="Quantity to return (base units)"
          placeholder="0"
          keyboardType="numeric"
          value={qty}
          onChangeText={setQty}
        />
        <TextField
          label="Reason (optional)"
          placeholder="e.g. damaged / expired / wrong item"
          value={reason}
          onChangeText={setReason}
        />
        <Button title={submitting ? 'Returning…' : 'Return to supplier'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
