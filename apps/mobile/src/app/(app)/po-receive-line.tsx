import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
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
import { useThemeColors } from '@/lib/theme/colors';
import { useCapabilities } from '@/lib/useCapabilities';
import { showAlert } from '@/lib/ui/alertStore';

export default function PoReceiveLineScreen() {
  const { orderId, lineId, productName, remaining, serialTracked: serialParam } = useLocalSearchParams<{
    orderId: string;
    lineId: string;
    productName: string;
    remaining: string;
    serialTracked: string;
  }>();
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const caps = useCapabilities();

  const serialTracked = serialParam === '1';
  const expiryRequired = caps.expiryTracking;
  const maxQty = Number(remaining ?? '0');

  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(serialTracked ? '' : (remaining ?? ''));
  const [serialText, setSerialText] = useState('');
  const [actualUnitCost, setActualUnitCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Serial-tracked lines: one IMEI per line, so the count IS the quantity.
  const serials = serialText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  const qty = serialTracked ? serials.length : Number(quantity) || 0;

  const onSubmit = async () => {
    if (!companyId || !orderId || !lineId) return;
    if (!batchNumber.trim()) {
      showAlert('Missing batch number', 'Enter a batch/lot number.');
      return;
    }
    if (expiryRequired && !expiryDate) {
      showAlert('Missing expiry date', 'Select the expiry date for this batch.');
      return;
    }
    if (serialTracked ? serials.length <= 0 : !Number.isInteger(qty) || qty <= 0) {
      showAlert('Invalid quantity', serialTracked ? 'Enter at least one serial number.' : 'Quantity must be a positive whole number.');
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
        expiryDate: expiryDate ? `${expiryDate}T00:00:00.000Z` : null,
        actualUnitCost: actualUnitCost.trim() ? Number(actualUnitCost) : null,
        serialNumbers: serialTracked ? serials : undefined,
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
            <Text className="text-xs text-text-secondary">
              {serials.length} unit(s) — each serial is one unit received.{serials.length > maxQty ? ` · exceeds remaining (${maxQty})` : ''}
            </Text>
          </View>
        ) : (
          <TextField label="Quantity received now" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        )}

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
