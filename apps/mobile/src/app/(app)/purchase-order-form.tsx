import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { productsApi } from '@/lib/api/endpoints/products';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import { suppliersApi } from '@/lib/api/endpoints/suppliers';
import type { RestockSuggestionItem, SupplierResponse } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import type { ProductSearchResult } from '@/lib/api/types/catalog';

interface DraftLine {
  productId: string;
  name: string;
  quantity: string;
  unitCost: string;
}

export default function PurchaseOrderFormScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<RestockSuggestionItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (companyId) suppliersApi.list(companyId).then(setSuppliers).catch(() => {});
    }, [companyId]),
  );

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, supplierQuery]);

  // Reorder suggestions for whichever supplier is selected — everything
  // this supplier stocks that's currently at or below its low-stock
  // threshold at this location, with a one-tap "add to order" per item.
  useEffect(() => {
    if (!companyId || !locationId || !supplierId) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    productsApi
      .restockSuggestions(companyId, supplierId, locationId)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [companyId, locationId, supplierId]);

  const addSuggestion = (suggestion: RestockSuggestionItem) => {
    setLines((prev) => {
      if (prev.some((l) => l.productId === suggestion.productId)) return prev;
      return [
        ...prev,
        {
          productId: suggestion.productId,
          name: suggestion.name,
          quantity: String(suggestion.suggestedQuantity),
          unitCost: String(suggestion.estimatedUnitCost),
        },
      ];
    });
  };

  const runSearch = async (text: string) => {
    setQuery(text);
    if (!companyId || !text.trim()) {
      setResults([]);
      return;
    }
    setResults(await localCatalogQueryService.searchProducts(companyId, text.trim()));
  };

  const addLine = (product: ProductSearchResult) => {
    if (lines.some((l) => l.productId === product.productId)) return;
    setLines((prev) => [...prev, { productId: product.productId, name: product.name, quantity: '1', unitCost: '' }]);
    setQuery('');
    setResults([]);
  };

  const updateLine = (productId: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const onSubmit = async () => {
    if (!companyId || !locationId) return;
    if (!supplierId) {
      showAlert('Missing supplier', 'Select a supplier for this order.');
      return;
    }
    if (lines.length === 0) {
      showAlert('No lines', 'Add at least one product line.');
      return;
    }
    const parsedLines = lines.map((l) => ({
      productId: l.productId,
      quantityOrdered: Number(l.quantity),
      unitCost: Number(l.unitCost || '0'),
    }));
    if (parsedLines.some((l) => !Number.isInteger(l.quantityOrdered) || l.quantityOrdered <= 0)) {
      showAlert('Invalid quantity', 'Every line needs a positive whole-number quantity.');
      return;
    }
    if (parsedLines.some((l) => !Number.isFinite(l.unitCost) || l.unitCost < 0)) {
      showAlert('Invalid cost', 'Unit cost must be zero or positive.');
      return;
    }

    setSubmitting(true);
    try {
      const order = await purchaseOrdersApi.create(companyId, {
        locationId,
        supplierId,
        notes: notes.trim() || null,
        lines: parsedLines,
      });
      router.replace({ pathname: '/purchase-order-detail', params: { id: order.id } });
    } catch (err) {
      showAlert('Could not create purchase order', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">New purchase order</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <Text className="text-xs text-text-secondary">Location: {locationName ?? '—'}</Text>

        <View className="gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Supplier</Text>
          {selectedSupplier && !supplierDropdownOpen ? (
            <Pressable
              onPress={() => {
                setSupplierQuery('');
                setSupplierDropdownOpen(true);
              }}
              className="flex-row items-center justify-between rounded-xl border border-primary bg-primary/10 px-3.5 py-3">
              <Text className="text-sm font-semibold text-primary">{selectedSupplier.name}</Text>
              <Text className="text-xs font-semibold text-primary">Change</Text>
            </Pressable>
          ) : (
            <>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                  placeholder="Search suppliers by name"
                  placeholderTextColor={colors.placeholder}
                  value={supplierQuery}
                  onChangeText={setSupplierQuery}
                  onFocus={() => setSupplierDropdownOpen(true)}
                  autoCapitalize="none"
                />
                {supplierDropdownOpen && selectedSupplier ? (
                  <Pressable onPress={() => setSupplierDropdownOpen(false)} hitSlop={8} className="pl-3">
                    <Ionicons name="close-circle" size={22} color={colors.iconMuted} />
                  </Pressable>
                ) : null}
              </View>
              {supplierDropdownOpen ? (
                <View className="rounded-xl border border-border bg-surface">
                  {filteredSuppliers.length === 0 ? (
                    <Text className="p-3.5 text-sm text-text-secondary">
                      {suppliers.length === 0 ? 'No suppliers yet — add one first.' : 'No matching suppliers.'}
                    </Text>
                  ) : (
                    filteredSuppliers.map((s, index) => (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setSupplierId(s.id);
                          setSupplierQuery('');
                          setSupplierDropdownOpen(false);
                        }}
                        className={`px-3.5 py-3 ${index < filteredSuppliers.length - 1 ? 'border-b border-border' : ''}`}>
                        <Text className="text-sm font-semibold text-text-primary">{s.name}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </>
          )}
        </View>

        {supplierId ? (
          <View className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Suggested reorder</Text>
            {loadingSuggestions ? (
              <Text className="text-sm text-text-secondary">Checking stock levels…</Text>
            ) : suggestions.length === 0 ? (
              <Text className="text-sm text-text-secondary">Nothing from this supplier is low on stock right now.</Text>
            ) : (
              suggestions.map((s) => {
                const added = lines.some((l) => l.productId === s.productId);
                return (
                  <View key={s.productId} className="flex-row items-center justify-between rounded-xl bg-accent-amber-soft p-3.5">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-semibold text-text-primary">{s.name}</Text>
                      <Text className="text-xs text-text-secondary">
                        {s.currentStock} in stock (threshold {s.lowStockThreshold}) · suggest {s.suggestedQuantity} @{' '}
                        {formatCurrency(s.estimatedUnitCost, currency)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => addSuggestion(s)}
                      disabled={added}
                      className={`rounded-lg px-3 py-1.5 ${added ? 'bg-border' : 'bg-primary'}`}>
                      <Text className="text-xs font-semibold text-white">{added ? 'Added' : 'Add'}</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} />

        <View className="gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Add product</Text>
          <TextInput
            className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
            placeholder="Search product name or barcode"
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={runSearch}
            autoCapitalize="none"
          />
          {results.length > 0 ? (
            <View className="rounded-xl border border-border bg-surface">
              {results.map((r, index) => (
                <Pressable
                  key={r.productId}
                  onPress={() => addLine(r)}
                  className={`px-3.5 py-3 ${index < results.length - 1 ? 'border-b border-border' : ''}`}>
                  <Text className="text-sm font-semibold text-text-primary">{r.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {lines.map((line) => (
          <View key={line.productId} className="gap-2 rounded-xl bg-surface p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{line.name}</Text>
              <Pressable onPress={() => removeLine(line.productId)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-xs text-text-secondary">Quantity</Text>
                <TextInput
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  keyboardType="numeric"
                  value={line.quantity}
                  onChangeText={(v) => updateLine(line.productId, { quantity: v })}
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-xs text-text-secondary">Unit cost ({currency})</Text>
                <TextInput
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  keyboardType="numeric"
                  value={line.unitCost}
                  onChangeText={(v) => updateLine(line.productId, { unitCost: v })}
                />
              </View>
            </View>
          </View>
        ))}

        <Button title={submitting ? 'Creating…' : 'Create purchase order'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
