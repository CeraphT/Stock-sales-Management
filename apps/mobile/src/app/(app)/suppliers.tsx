import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { ApiError } from '@/lib/api/client';
import { suppliersApi } from '@/lib/api/endpoints/suppliers';
import type { SupplierResponse } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function SuppliersScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const colors = useThemeColors();

  const [query, setQuery] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (search?: string) => {
      if (!companyId) return;
      setLoading(true);
      try {
        setSuppliers(await suppliersApi.list(companyId, search?.trim() || undefined));
      } catch (err) {
        showAlert('Could not load suppliers', err instanceof Error ? err.message : 'Something went wrong.');
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

  const onDelete = (supplier: SupplierResponse) => {
    showAlert('Delete supplier?', `"${supplier.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!companyId) return;
          try {
            await suppliersApi.delete(companyId, supplier.id);
            await refresh(query);
          } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Something went wrong.';
            showAlert('Could not delete supplier', message);
          }
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
          <Text className="text-lg font-bold text-text-primary">Suppliers</Text>
          <Pressable
            onPress={() => router.push('/supplier-form')}
            accessibilityLabel="Add supplier"
            className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-90">
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search suppliers"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            refresh(text);
          }}
          autoCapitalize="none"
        />
        <Text className="mt-2 text-xs text-text-secondary">
          {suppliers.length} {suppliers.length === 1 ? 'supplier' : 'suppliers'}
        </Text>
      </View>

      <FlatList
        data={suppliers}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-2 p-4"
        refreshing={loading}
        onRefresh={() => refresh(query)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/supplier-form',
                params: {
                  id: item.id,
                  name: item.name,
                  contactPhone: item.contactPhone ?? '',
                  contactEmail: item.contactEmail ?? '',
                },
              })
            }
            className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
            <View className="flex-1 pr-2">
              <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
              <Text className="text-xs text-text-secondary">{item.contactPhone ?? '—'} · {item.contactEmail ?? '—'}</Text>
            </View>
            <Pressable onPress={() => onDelete(item)} hitSlop={8} className="h-8 w-8 items-center justify-center">
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No suppliers yet.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
