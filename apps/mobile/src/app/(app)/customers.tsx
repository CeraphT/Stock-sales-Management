import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { customersApi } from '@/lib/api/endpoints/customers';
import type { CustomerResponse } from '@/lib/api/types/customers';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function CustomersScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCustomers));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (search?: string) => {
      if (!companyId) return;
      setLoading(true);
      try {
        setCustomers(await customersApi.list(companyId, search?.trim() || undefined));
      } catch (err) {
        showAlert('Could not load customers', err instanceof Error ? err.message : 'Something went wrong.');
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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Customers</Text>
          <Pressable
            onPress={() => router.push('/customer-form')}
            accessibilityLabel="Add customer"
            className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-90">
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search name or phone"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            refresh(text);
          }}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-2 p-4"
        refreshing={loading}
        onRefresh={() => refresh(query)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/customer-detail', params: { id: item.id } })}
            className="rounded-xl bg-surface p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
              <Text className="text-xs text-text-secondary">{item.phone ?? '—'}</Text>
            </View>
            <Text className="mt-1 text-xs text-text-secondary">
              Credit: {formatCurrency(item.creditBalance, currency)} · {item.loyaltyPointsBalance} pts · Store credit{' '}
              {formatCurrency(item.loyaltyStoreCreditBalance, currency)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No customers yet.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
