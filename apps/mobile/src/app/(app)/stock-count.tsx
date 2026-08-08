import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ApiError } from '@/lib/api/client';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function StockCountScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const colors = useThemeColors();

  const { data: batches = [], refetch } = useQuery({
    queryKey: ['company-batches', companyId, locationId],
    queryFn: () => productsApi.companyBatches(companyId!, locationId ?? undefined),
    enabled: !!companyId,
  });

  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? batches.filter((b) => b.productName.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q)) : batches;
  }, [batches, search]);

  const variances = useMemo(
    () =>
      batches
        .filter((b) => counts[b.batchId] !== undefined && counts[b.batchId] !== '')
        .map((b) => ({ batchId: b.batchId, counted: Number(counts[b.batchId]), delta: Number(counts[b.batchId]) - b.quantityInBaseUnits }))
        .filter((v) => Number.isFinite(v.counted) && v.delta !== 0),
    [batches, counts],
  );

  const post = async () => {
    if (!companyId || variances.length === 0) return;
    setSubmitting(true);
    try {
      const result = await productsApi.countStock(companyId, {
        lines: variances.map((v) => ({ batchId: v.batchId, countedQuantityInBaseUnits: v.counted })),
      });
      await syncNow();
      await refetch();
      setCounts({});
      const applied = result.filter((r) => r.delta !== 0).length;
      showAlert('Count posted', `${applied} batch(es) adjusted.`);
    } catch (err) {
      showAlert('Could not post the count', err instanceof ApiError ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Stock count</Text>
          <View className="w-12" />
        </View>
      </View>

      <View className="px-5 pt-3">
        <TextInput
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-base text-text-primary"
          placeholder="Search product or batch…"
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <ScrollView contentContainerClassName="gap-2 p-5" keyboardShouldPersistTaps="handled">
        {rows.length === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">No stock batches to count.</Text>
        ) : (
          rows.map((b) => {
            const raw = counts[b.batchId];
            const counted = raw === undefined || raw === '' ? null : Number(raw);
            const delta = counted == null ? null : counted - b.quantityInBaseUnits;
            return (
              <View key={b.batchId} className="flex-row items-center gap-3 rounded-xl bg-surface p-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-text-primary">{b.productName}</Text>
                  <Text className="text-xs text-text-secondary">
                    {b.batchNumber} · system {b.quantityInBaseUnits}
                    {delta != null && delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta}` : ''}
                  </Text>
                </View>
                <TextInput
                  className="w-24 rounded-lg border border-border bg-background px-2 py-2 text-right text-sm text-text-primary"
                  placeholder="count"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  value={raw ?? ''}
                  onChangeText={(v) => setCounts((c) => ({ ...c, [b.batchId]: v }))}
                />
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="border-t border-border bg-surface p-4">
        <Text className="mb-2 text-center text-xs text-text-secondary">{variances.length} batch(es) with a variance</Text>
        <Button
          title={submitting ? 'Posting…' : 'Post count & adjust'}
          loading={submitting}
          onPress={post}
          disabled={variances.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}
