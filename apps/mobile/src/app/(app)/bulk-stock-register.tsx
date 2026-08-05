import { Ionicons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { parseRawText, resolveRows, type ParsedBulkStockRow } from '@/lib/bulk/parseBulkStock';
import { db } from '@/lib/db/client';
import { categories, products } from '@/lib/db/schema';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

const EXAMPLE_ROW = 'Paracetamol 500mg, 6009123456789, Pain Relief, 150, 250, 20, LOT-2026-01, 2027-06-30, 100';

export default function BulkStockRegisterScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCatalog));
  const locationId = useAuthStore((s) => s.locationId);
  const colors = useThemeColors();

  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedBulkStockRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [processing, setProcessing] = useState(false);

  const onParse = async () => {
    if (!companyId || !rawText.trim()) return;
    setParsing(true);
    try {
      const [existingProducts, existingCategories] = await Promise.all([
        db.query.products.findMany({ where: eq(products.companyId, companyId) }),
        db.query.categories.findMany({ where: eq(categories.companyId, companyId) }),
      ]);
      const rows = parseRawText(rawText);
      setParsed(resolveRows(rows, existingProducts, existingCategories));
    } finally {
      setParsing(false);
    }
  };

  const validRows = (parsed ?? []).filter((r) => r.kind !== 'error');
  const errorRows = (parsed ?? []).filter((r) => r.kind === 'error');

  const onRegister = async () => {
    if (!companyId || !locationId || validRows.length === 0) return;
    setProcessing(true);
    let created = 0;
    let updated = 0;
    const failures: string[] = [];

    for (const row of validRows) {
      try {
        if (row.kind === 'create') {
          const product = await productsApi.create(companyId, {
            name: row.productName,
            barcode: row.barcode,
            categoryId: row.categoryId,
            supplierId: null,
            purchasePrice: row.purchasePrice,
            salePrice: row.salePrice,
            lowStockThreshold: row.lowStockThreshold,
            taxRateOverridePercent: null,
            isFavorite: false,
            packagingLevels: null,
          });
          await productsApi.receiveStock(companyId, product.id, {
            locationId,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate ? `${row.expiryDate}T00:00:00.000Z` : null,
            quantityInBaseUnits: row.quantity,
            purchasePricePerBaseUnit: row.purchasePrice,
          });
          created++;
        } else if (row.kind === 'update') {
          await productsApi.receiveStock(companyId, row.productId, {
            locationId,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate ? `${row.expiryDate}T00:00:00.000Z` : null,
            quantityInBaseUnits: row.quantity,
            purchasePricePerBaseUnit: row.purchasePricePerBaseUnit,
          });
          updated++;
        }
      } catch (err) {
        failures.push(`Line ${row.lineNumber} (${row.productName}): ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    try {
      await syncNow();
    } catch {
      // Sync failure here doesn't undo the writes already made — the next
      // regular sync (dashboard/catalog focus) will pick everything up.
    }

    setProcessing(false);
    setParsed(null);
    setRawText('');
    showAlert(
      'Bulk registration complete',
      `${created} product${created === 1 ? '' : 's'} created, ${updated} restocked.` +
        (failures.length > 0 ? `\n\n${failures.length} failed:\n${failures.join('\n')}` : ''),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Bulk stock registration</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <View className="gap-2 rounded-2xl bg-surface p-4">
          <Text className="text-sm font-bold text-text-primary">How it works</Text>
          <Text className="text-xs text-text-secondary">
            One product per line, no header row. Paste rows straight from Excel/Sheets (select your data, copy, paste below) or from a
            CSV file's contents. Columns, in order:
          </Text>
          <Text className="text-xs font-semibold text-text-primary">
            Product Name, Barcode, Category, Purchase Price, Sale Price, Low Stock Threshold, Batch Number, Expiry Date (YYYY-MM-DD),
            Quantity
          </Text>
          <Text className="text-xs text-text-secondary">
            Barcode is used to match an existing product first, then the exact product name. If a product already exists, Purchase
            Price/Sale Price/Threshold can be left blank — its stock is just topped up. Example:
          </Text>
          <Text className="rounded-lg bg-background p-2 text-[11px] text-text-secondary">{EXAMPLE_ROW}</Text>
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Paste product rows</Text>
          <TextInput
            className="min-h-[140px] rounded-xl border border-border bg-background p-3 text-sm text-text-primary"
            placeholder={EXAMPLE_ROW}
            placeholderTextColor={colors.placeholder}
            value={rawText}
            onChangeText={(v) => {
              setRawText(v);
              setParsed(null);
            }}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
          />
        </View>

        <Button title={parsing ? 'Checking…' : 'Check rows'} loading={parsing} disabled={!rawText.trim()} onPress={onParse} />

        {parsed ? (
          <View className="gap-2">
            {/* Check summary — mirrors desktop's guidance block. */}
            <View className="gap-1 rounded-xl border border-border bg-surface p-4">
              <Text className="text-sm font-bold text-text-primary">Check summary</Text>
              <Text className="text-sm text-text-secondary">
                ✅ <Text className="font-semibold text-success">{validRows.length}</Text> ready —{' '}
                {validRows.filter((r) => r.kind === 'create').length} new, {validRows.filter((r) => r.kind === 'update').length} to restock
              </Text>
              {errorRows.length > 0 ? (
                <Text className="text-sm font-medium text-error">
                  ❌ {errorRows.length} with errors — fix the lines marked ❌ below, then Check rows again.
                </Text>
              ) : (
                <Text className="text-sm font-medium text-success">✓ All rows are valid — ready to register.</Text>
              )}
            </View>
            {parsed.map((row) => (
              <View key={row.lineNumber} className="rounded-xl bg-surface p-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={row.kind === 'error' ? 'close-circle' : row.kind === 'create' ? 'add-circle' : 'sync-circle'}
                    size={16}
                    color={row.kind === 'error' ? colors.error : row.kind === 'create' ? colors.accentBlue : colors.success}
                  />
                  <Text className="flex-1 text-sm font-semibold text-text-primary">
                    Line {row.lineNumber} · {row.productName}
                  </Text>
                </View>
                {row.kind === 'error' ? <Text className="mt-1 text-xs text-error">{row.message}</Text> : null}
                {row.kind === 'create' ? (
                  <Text className="mt-1 text-xs text-text-secondary">
                    New product · {row.quantity} units received{row.categoryWarning ? ` · ${row.categoryWarning}` : ''}
                  </Text>
                ) : null}
                {row.kind === 'update' ? (
                  <Text className="mt-1 text-xs text-text-secondary">Existing product · {row.quantity} units added to stock</Text>
                ) : null}
              </View>
            ))}

            <Button
              title={processing ? 'Registering…' : `Register ${validRows.length} item${validRows.length === 1 ? '' : 's'}`}
              loading={processing}
              disabled={validRows.length === 0 || processing}
              onPress={onRegister}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
