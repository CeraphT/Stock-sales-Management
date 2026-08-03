import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { PackagingLevelsEditor, parsePackagingLevels, type DraftPackagingLevel } from '@/components/PackagingLevelsEditor';
import { TextField } from '@/components/TextField';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useScanCaptureStore } from '@/lib/scan/captureStore';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function AddProductScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const capturedCode = useScanCaptureStore((s) => s.code);
  const clearCapturedCode = useScanCaptureStore((s) => s.clear);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [packagingLevels, setPackagingLevels] = useState<DraftPackagingLevel[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Picks up a code handed back by the scanner (mode=capture) whenever this
  // screen regains focus — covers both "came back from scanning" and "this
  // screen was already open when the code arrived" cases.
  useFocusEffect(
    useCallback(() => {
      if (capturedCode) {
        setBarcode(capturedCode);
        clearCapturedCode();
      }
    }, [capturedCode, clearCapturedCode]),
  );

  const onSubmit = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a product name.');
      return;
    }
    const purchase = Number(purchasePrice || '0');
    const sale = Number(salePrice || '0');
    const threshold = Number(lowStockThreshold || '0');
    if ([purchase, sale, threshold].some((n) => Number.isNaN(n) || n < 0)) {
      showAlert('Invalid numbers', 'Prices and threshold must be zero or positive.');
      return;
    }
    const parsedLevels = parsePackagingLevels(packagingLevels);
    if (!parsedLevels.ok) {
      showAlert('Invalid packaging level', parsedLevels.message);
      return;
    }

    setSubmitting(true);
    try {
      await productsApi.create(companyId, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId: null,
        supplierId: null,
        purchasePrice: purchase,
        salePrice: sale,
        lowStockThreshold: threshold,
        taxRateOverridePercent: null,
        isFavorite: false,
        packagingLevels: parsedLevels.value.length > 0 ? parsedLevels.value : null,
      });
      // Brings the new product into the local catalog cache immediately —
      // otherwise it wouldn't be scannable/searchable until the next
      // periodic sync.
      await syncNow();
      router.back();
    } catch (err) {
      showAlert('Could not create product', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Add product</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField label="Product name" placeholder="e.g. Amoxicillin 500mg" value={name} onChangeText={setName} />

        <View className="gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Barcode (optional)</Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder="Scan or type"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              value={barcode}
              onChangeText={setBarcode}
            />
            <Pressable
              onPress={() => router.push('/scanner?mode=capture')}
              accessibilityLabel="Scan barcode"
              className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:opacity-90">
              <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <TextField
          label={`Purchase price (${currency})`}
          placeholder="0"
          keyboardType="numeric"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
        />
        <TextField
          label={`Sale price (${currency})`}
          placeholder="0"
          keyboardType="numeric"
          value={salePrice}
          onChangeText={setSalePrice}
        />
        <TextField
          label="Low stock threshold"
          placeholder="0"
          keyboardType="numeric"
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
        />

        <PackagingLevelsEditor levels={packagingLevels} onChange={setPackagingLevels} currency={currency} />

        <Button title={submitting ? 'Creating…' : 'Create product'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
