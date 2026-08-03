import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { TextField } from '@/components/TextField';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';

export default function StockReceiveScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();

  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !locationId || !productId) return;
    if (!batchNumber.trim()) {
      showAlert('Missing batch number', 'Enter a batch/lot number.');
      return;
    }
    if (!expiryDate) {
      showAlert('Missing expiry date', 'Select the expiry date for this batch.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      showAlert('Invalid quantity', 'Quantity must be a positive whole number.');
      return;
    }

    setSubmitting(true);
    try {
      await productsApi.receiveStock(companyId, productId, {
        locationId,
        batchNumber: batchNumber.trim(),
        expiryDate: `${expiryDate}T00:00:00.000Z`,
        quantityInBaseUnits: qty,
        purchasePricePerBaseUnit: purchasePrice.trim() ? Number(purchasePrice) : null,
      });
      await syncNow();
      router.back();
    } catch (err) {
      showAlert('Could not receive stock', err instanceof Error ? err.message : 'Something went wrong.');
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
        <TextField label="Batch / lot number" placeholder="e.g. LOT-2026-07" value={batchNumber} onChangeText={setBatchNumber} />
        <DateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} minimumDate={new Date()} />
        <TextField label="Quantity (base units)" placeholder="0" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        <TextField
          label={`Purchase price per base unit (${currency}, optional)`}
          placeholder="Defaults to the product's catalog cost"
          keyboardType="numeric"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
        />

        <Button title={submitting ? 'Receiving…' : 'Receive stock'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
