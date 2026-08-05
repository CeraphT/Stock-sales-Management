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
import { buildTemplateWorkbook, parseFilledSheetRows } from '@stockflow/core/bulk/bulkTemplate';
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
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onParse = async (text?: string) => {
    const src = (text ?? rawText).trim();
    if (!companyId || !src) return;
    setParsing(true);
    try {
      const [existingProducts, existingCategories] = await Promise.all([
        db.query.products.findMany({ where: eq(products.companyId, companyId) }),
        db.query.categories.findMany({ where: eq(categories.companyId, companyId) }),
      ]);
      setParsed(resolveRows(parseRawText(src), existingProducts, existingCategories));
    } finally {
      setParsing(false);
    }
  };

  // Share a fillable .xls template via the Android share sheet (save to Files,
  // send to a PC, etc.). Native file/share modules are imported lazily — this
  // is a route file and Expo Router eagerly evaluates top-level imports.
  const onDownloadTemplate = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { File, Paths } = await import('expo-file-system');
      const Sharing = await import('expo-sharing');
      const file = new File(Paths.cache, 'bulk-stock-template.xls');
      if (file.exists) file.delete();
      file.create();
      file.write(buildTemplateWorkbook());
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/vnd.ms-excel', dialogTitle: 'Bulk stock template' });
      }
    } catch (err) {
      showAlert('Could not create the template', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setDownloading(false);
    }
  };

  // Pick a filled .xlsx/.xls/.csv, parse it with SheetJS (lazy — large lib),
  // drop the rows into the box and run the same check as pasting.
  const onUpload = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const { File } = await import('expo-file-system');
      const buf = await new File(res.assets[0].uri).arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        showAlert('Empty file', 'That file has no sheets.');
        return;
      }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      const text = parseFilledSheetRows(rows);
      if (!text.trim()) {
        showAlert('No rows found', 'No product rows found in that file.');
        return;
      }
      setRawText(text);
      await onParse(text);
    } catch (err) {
      showAlert('Could not read that file', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setUploading(false);
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
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <Pressable onPress={onDownloadTemplate} disabled={downloading} className="rounded-lg bg-primary/10 px-3 py-2 active:opacity-80">
              <Text className="text-xs font-bold text-primary">{downloading ? '…' : '⬇ Download template'}</Text>
            </Pressable>
            <Pressable onPress={onUpload} disabled={uploading} className="rounded-lg bg-primary px-3 py-2 active:opacity-90">
              <Text className="text-xs font-bold text-white">{uploading ? '…' : '⬆ Upload filled file'}</Text>
            </Pressable>
          </View>
          <Text className="text-[11px] text-text-secondary">Blank fields get sensible defaults (barcode, batch, qty 1).</Text>
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

        <Button title={parsing ? 'Checking…' : 'Check rows'} loading={parsing} disabled={!rawText.trim()} onPress={() => onParse()} />

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
