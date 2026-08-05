import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { StockBadge } from '@/components/StockBadge';
import { productsApi } from '@/lib/api/endpoints/products';
import type { ProductCatalogItem } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function ArchivedProductsScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCatalog));
  const colors = useThemeColors();
  const currency = useCompanyCurrency();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (search?: string) => {
      if (!companyId) return;
      setLoading(true);
      try {
        const page = await productsApi.catalog(companyId, search?.trim() || undefined, 1, { archivedOnly: true });
        setItems(page.items);
      } catch (err) {
        showAlert('Could not load archived products', err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  useFocusEffect(
    useCallback(() => {
      refresh(query);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId]),
  );

  const onRestore = (item: ProductCatalogItem) => {
    showAlert('Restore product?', `"${item.name}" will become active again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          if (!companyId) return;
          await productsApi.restore(companyId, item.id);
          await syncNow();
          await refresh(query);
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Archived products</Text>
          <View className="w-12" />
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search name or barcode"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            refresh(text);
          }}
          autoCapitalize="none"
        />
        <Text className="mt-2 text-xs text-text-secondary">
          Archived products are hidden from the catalog and the point of sale. Restore one to sell it again.
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-2 p-4"
        refreshing={loading}
        onRefresh={() => refresh(query)}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
              {item.barcode ? <Text className="text-xs text-text-secondary">Barcode: {item.barcode}</Text> : null}
              <View className="mt-1 flex-row items-center gap-2">
                <Text className="text-xs font-semibold text-primary">{formatCurrency(item.salePrice, currency)}</Text>
                <StockBadge status={item.stockStatus} />
              </View>
            </View>
            <Pressable onPress={() => onRestore(item)} className="rounded-lg bg-primary px-3 py-2">
              <Text className="text-xs font-semibold text-white">♻️ Restore</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No archived products match.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
