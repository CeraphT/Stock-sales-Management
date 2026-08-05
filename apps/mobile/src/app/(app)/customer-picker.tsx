import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import type { CustomerResponse } from '@/lib/api/types/customers';
import { useAuthStore } from '@/lib/auth/store';
import { useCartStore } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { useThemeColors } from '@/lib/theme/colors';

export default function CustomerPickerScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const setCustomer = useCartStore((s) => s.setCustomer);
  const colors = useThemeColors();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResponse[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async (text: string) => {
    setQuery(text);
    if (!companyId) return;
    setSearching(true);
    try {
      setResults(await localCatalogQueryService.searchCustomers(companyId, text.trim()));
    } finally {
      setSearching(false);
    }
  };

  const select = (customer: CustomerResponse | null) => {
    setCustomer(customer ? { id: customer.id, name: customer.name } : null);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Customer</Text>
          <View className="w-12" />
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search name or phone"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
      </View>

      <View className="mx-4 mt-4 flex-row gap-2">
        <Pressable onPress={() => select(null)} className="flex-1 rounded-xl border border-border bg-surface px-4 py-3">
          <Text className="text-sm font-semibold text-text-primary">Walk-in (no customer)</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/customer-form')}
          accessibilityLabel="New customer"
          className="flex-row items-center gap-1.5 rounded-xl border border-primary bg-primary/10 px-4 py-3">
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text className="text-sm font-semibold text-primary">New</Text>
        </Pressable>
      </View>

      {searching ? (
        <ActivityIndicator className="mt-6" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          renderItem={({ item }) => (
            <Pressable onPress={() => select(item)} className="rounded-xl bg-surface p-3">
              <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
              <Text className="text-xs text-text-secondary">
                {item.phone ?? '—'} · Credit: {formatCurrency(item.creditBalance, currency)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim() ? <Text className="p-4 text-center text-sm text-text-secondary">No matching customers.</Text> : null
          }
        />
      )}
    </SafeAreaView>
  );
}
