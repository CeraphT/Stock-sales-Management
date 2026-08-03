import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { TextField } from '@/components/TextField';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import { useAuthStore } from '@/lib/auth/store';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';

export default function PoReceiveLineScreen() {
  const { orderId, lineId, productName, remaining } = useLocalSearchParams<{
    orderId: string;
    lineId: string;
    productName: string;
    remaining: string;
  }>();
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();

  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(remaining ?? '');
  const [actualUnitCost, setActualUnitCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !orderId || !lineId) return;
    if (!batchNumber.trim()) {
      showAlert('Missing batch number', 'Enter a batch/lot number.');
      return;
    }
    if (!expiryDate) {
      showAlert('Missing expiry date', 'Select the expiry date for this batch.');
      return;
    }
    const qty = Number(quantity);
    const maxQty = Number(remaining ?? '0');
    if (!Number.isInteger(qty) || qty <= 0) {
      showAlert('Invalid quantity', 'Quantity must be a positive whole number.');
      return;
    }
    if (qty > maxQty) {
      showAlert('Too many', `Only ${maxQty} remain on this line.`);
      return;
    }

    setSubmitting(true);
    try {
      await purchaseOrdersApi.receiveLine(companyId, orderId, lineId, {
        quantityReceivedNow: qty,
        batchNumber: batchNumber.trim(),
        expiryDate: `${expiryDate}T00:00:00.000Z`,
        actualUnitCost: actualUnitCost.trim() ? Number(actualUnitCost) : null,
      });
      await syncNow();
      router.back();
    } catch (err) {
      showAlert('Could not receive line', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Receive stock</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <Text className="text-sm font-semibold text-text-primary">{productName}</Text>
        <Text className="text-xs text-text-secondary">Up to {remaining} remaining on this line</Text>

        <TextField label="Batch / lot number" placeholder="e.g. LOT-2026-07" value={batchNumber} onChangeText={setBatchNumber} />
        <DateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} minimumDate={new Date()} />
        <TextField label="Quantity received now" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        <TextField
          label={`Actual unit cost (${currency}, optional)`}
          placeholder="Defaults to the ordered unit cost"
          keyboardType="numeric"
          value={actualUnitCost}
          onChangeText={setActualUnitCost}
        />

        <Button title={submitting ? 'Receiving…' : 'Receive stock'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
