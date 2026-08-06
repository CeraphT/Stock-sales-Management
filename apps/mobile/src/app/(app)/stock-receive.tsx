import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
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
import { useThemeColors } from '@/lib/theme/colors';
import { useCapabilities } from '@/lib/useCapabilities';
import { showAlert } from '@/lib/ui/alertStore';

export default function StockReceiveScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const caps = useCapabilities();

  const { data: product } = useQuery({
    queryKey: ['product', companyId, productId],
    queryFn: () => productsApi.get(companyId!, productId!),
    enabled: !!companyId && !!productId,
  });

  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [serialText, setSerialText] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const measure = !!product?.sellByMeasure;
  const measureUnit = product?.measureUnit ?? '';
  const measureUpm = product?.unitsPerMeasure && product.unitsPerMeasure > 0 ? product.unitsPerMeasure : 1;
  const serialTracked = !!product?.serialTracked;
  const expiryRequired = caps.expiryTracking;
  const serials = serialText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  const baseUnits = serialTracked ? serials.length : measure ? Math.round((Number(quantity) || 0) * measureUpm) : Number(quantity) || 0;

  const onSubmit = async () => {
    if (!companyId || !locationId || !productId) return;
    if (!batchNumber.trim()) {
      showAlert('Missing batch number', 'Enter a batch/lot number.');
      return;
    }
    if (expiryRequired && !expiryDate) {
      showAlert('Missing expiry date', 'Select the expiry date for this batch.');
      return;
    }
    if (baseUnits <= 0) {
      showAlert('Invalid quantity', serialTracked ? 'Enter at least one serial number.' : 'Quantity must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      await productsApi.receiveStock(companyId, productId, {
        locationId,
        batchNumber: batchNumber.trim(),
        expiryDate: expiryDate ? `${expiryDate}T00:00:00.000Z` : null,
        quantityInBaseUnits: baseUnits,
        // Cost entered per received unit (kg for measure); store per base unit.
        purchasePricePerBaseUnit: purchasePrice.trim() ? Number(purchasePrice) / (measure ? measureUpm : 1) : null,
        serialNumbers: serialTracked ? serials : undefined,
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
        {product ? <Text className="text-sm text-text-secondary">{product.name}</Text> : null}
        <TextField label="Batch / lot number" placeholder="e.g. LOT-2026-07" value={batchNumber} onChangeText={setBatchNumber} />
        <DateField label={expiryRequired ? 'Expiry date' : 'Expiry date (optional)'} value={expiryDate} onChange={setExpiryDate} minimumDate={new Date()} />

        {serialTracked ? (
          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Serial / IMEI numbers (one per line)</Text>
            <TextInput
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder={'SN-0001\nSN-0002'}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              multiline
              numberOfLines={6}
              style={{ minHeight: 120, textAlignVertical: 'top' }}
              value={serialText}
              onChangeText={setSerialText}
            />
            <Text className="text-xs text-text-secondary">{serials.length} unit(s) — each serial is one unit received.</Text>
          </View>
        ) : (
          <TextField
            label={measure ? `Quantity (${measureUnit})` : 'Quantity (base units)'}
            placeholder="0"
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
          />
        )}

        <TextField
          label={`Purchase price ${measure ? `per ${measureUnit}` : 'per base unit'} (${currency}, optional)`}
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
