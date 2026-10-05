import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineNotice } from '@/components/OfflineNotice';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { useLocalFirst } from '@/lib/hooks/useLocalFirst';
import { localMirrorQueries } from '@stockflow/core/local/mirrorQueries';
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

  // Offline-first: local mirror at once, server answer swapped in when reachable.
  // Search is applied on submit (like before), not on every keystroke.
  const [appliedSearch, setAppliedSearch] = useState('');
  const { data, loading, offline, reload } = useLocalFirst<CustomerResponse[]>({
    enabled: !!companyId,
    local: () => localMirrorQueries.listCustomers(companyId!, appliedSearch || undefined),
    remote: () => customersApi.list(companyId!, appliedSearch || undefined),
    errorTitle: 'Could not load customers',
    deps: [companyId, appliedSearch],
  });
  const customers = data ?? [];
  const refresh = async (search?: string) => {
    const next = search?.trim() ?? '';
    if (next === appliedSearch) await reload();
    else setAppliedSearch(next);
  };

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

      <OfflineNotice visible={offline} />
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
              <View className="flex-1 flex-row items-center gap-2 pr-2">
                <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
                {item.isBusiness ? (
                  <View className="rounded-md bg-accent-blue/15 px-1.5 py-0.5">
                    <Text className="text-[10px] font-bold text-accent-blue">🏢 Pro</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs text-text-secondary">{item.phone ?? '—'}</Text>
            </View>
            <View className="mt-1 flex-row flex-wrap gap-x-3">
              <Text className="text-xs text-text-secondary">
                Credit:{' '}
                <Text className={item.creditBalance > 0 ? 'font-semibold text-error' : 'text-text-primary'}>
                  {formatCurrency(item.creditBalance, currency)}
                </Text>
              </Text>
              <Text className="text-xs text-text-secondary">
                Store credit:{' '}
                <Text className={item.loyaltyStoreCreditBalance > 0 ? 'font-semibold text-success' : 'text-text-primary'}>
                  {formatCurrency(item.loyaltyStoreCreditBalance, currency)}
                </Text>
              </Text>
              {item.rewardsGranted > 0 ? <Text className="text-xs text-text-secondary">Rewards: 🎁 {item.rewardsGranted}</Text> : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No customers yet.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
