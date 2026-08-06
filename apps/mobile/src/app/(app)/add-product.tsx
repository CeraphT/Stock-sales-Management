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
import { MEASURE_UNITS, unitsPerMeasureFor } from '@/lib/businessTypes';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useScanCaptureStore } from '@/lib/scan/captureStore';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { useCapabilities } from '@/lib/useCapabilities';
import { showAlert } from '@/lib/ui/alertStore';

export default function AddProductScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const caps = useCapabilities();
  const capturedCode = useScanCaptureStore((s) => s.code);
  const clearCapturedCode = useScanCaptureStore((s) => s.clear);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [packagingLevels, setPackagingLevels] = useState<DraftPackagingLevel[]>([]);
  const [sellByMeasure, setSellByMeasure] = useState(false);
  const [measureUnit, setMeasureUnit] = useState('kg');
  const [serialTracked, setSerialTracked] = useState(false);
  const [manufacturer, setManufacturer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (capturedCode) {
        setBarcode(capturedCode);
        clearCapturedCode();
      }
    }, [capturedCode, clearCapturedCode]),
  );

  const priceUnit = sellByMeasure ? `/${measureUnit}` : '';

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

    // Sell-by-measure products store prices per BASE unit (e.g. per gram); the
    // form enters them per display unit (per kg), so divide by unitsPerMeasure.
    const upm = sellByMeasure ? unitsPerMeasureFor(measureUnit) : 1;

    setSubmitting(true);
    try {
      await productsApi.create(companyId, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId: null,
        supplierId: null,
        purchasePrice: purchase / upm,
        salePrice: sale / upm,
        lowStockThreshold: threshold,
        taxRateOverridePercent: null,
        isFavorite: false,
        // Packaging levels are mutually exclusive with measure / serial products.
        packagingLevels: sellByMeasure || serialTracked ? null : parsedLevels.value.length > 0 ? parsedLevels.value : null,
        sellByMeasure,
        measureUnit: sellByMeasure ? measureUnit : null,
        unitsPerMeasure: upm,
        serialTracked,
        manufacturer: manufacturer.trim() || null,
      });
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

        {/* Sell-by-measure (weight/length/volume) — behind the capability flag. */}
        {caps.sellByMeasure ? (
          <View className="gap-2 rounded-xl border border-border p-3">
            <Pressable className="flex-row items-center gap-2" onPress={() => { setSellByMeasure((v) => !v); if (!sellByMeasure) setSerialTracked(false); }}>
              <Ionicons name={sellByMeasure ? 'checkbox' : 'square-outline'} size={20} color={sellByMeasure ? colors.primary : colors.textSecondary} />
              <Text className="text-sm font-semibold text-text-primary">⚖️ Sold by weight / measure</Text>
            </Pressable>
            {sellByMeasure ? (
              <View className="flex-row flex-wrap gap-1.5">
                {MEASURE_UNITS.map((m) => (
                  <Pressable
                    key={m.unit}
                    onPress={() => setMeasureUnit(m.unit)}
                    className={`rounded-lg border px-3 py-1.5 ${measureUnit === m.unit ? 'border-primary bg-primary/10' : 'border-border'}`}>
                    <Text className={`text-sm ${measureUnit === m.unit ? 'font-bold text-primary' : 'text-text-primary'}`}>{m.unit}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Serial / IMEI tracking — behind the capability flag. */}
        {caps.serialTracking ? (
          <Pressable
            className="flex-row items-center gap-2 rounded-xl border border-border p-3"
            onPress={() => { setSerialTracked((v) => !v); if (!serialTracked) setSellByMeasure(false); }}>
            <Ionicons name={serialTracked ? 'checkbox' : 'square-outline'} size={20} color={serialTracked ? colors.primary : colors.textSecondary} />
            <Text className="text-sm font-semibold text-text-primary">🔢 Track serial / IMEI numbers</Text>
          </Pressable>
        ) : null}

        {caps.assembly ? (
          <TextField label="Manufacturer / brand (optional)" value={manufacturer} onChangeText={setManufacturer} />
        ) : null}

        <TextField
          label={`Purchase price (${currency})${priceUnit}`}
          placeholder="0"
          keyboardType="numeric"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
        />
        <TextField
          label={`Sale price (${currency})${priceUnit}`}
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

        {!sellByMeasure && !serialTracked ? (
          <PackagingLevelsEditor levels={packagingLevels} onChange={setPackagingLevels} currency={currency} />
        ) : null}

        <Button title={submitting ? 'Creating…' : 'Create product'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
