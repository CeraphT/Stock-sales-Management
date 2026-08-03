import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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

export default function StockAdjustScreen() {
  const { productId, batchId } = useLocalSearchParams<{ productId: string; batchId: string }>();
  const companyId = useAuthStore((s) => s.companyId);

  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !productId || !batchId) return;
    const deltaNumber = Number(delta);
    if (!Number.isInteger(deltaNumber) || deltaNumber === 0) {
      showAlert('Invalid quantity', 'Enter a non-zero whole number (negative for a loss, positive for a correction).');
      return;
    }
    if (!reason.trim()) {
      showAlert('Reason required', 'Enter a reason for this adjustment (breakage, theft, count correction, etc.).');
      return;
    }

    setSubmitting(true);
    try {
      await productsApi.adjustStock(companyId, productId, {
        batchId,
        deltaInBaseUnits: deltaNumber,
        reason: reason.trim(),
      });
      await syncNow();
      router.back();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong.';
      showAlert('Could not adjust stock', message);
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
          <Text className="text-lg font-bold text-text-primary">Adjust stock</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField
          label="Quantity change (base units)"
          placeholder="e.g. -5 for breakage, 3 for a correction"
          keyboardType="numbers-and-punctuation"
          value={delta}
          onChangeText={setDelta}
        />
        <TextField label="Reason" placeholder="e.g. Breakage during handling" value={reason} onChangeText={setReason} />

        <Button title={submitting ? 'Adjusting…' : 'Apply adjustment'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
