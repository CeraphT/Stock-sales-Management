import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { SkeletonList } from '@/components/Skeleton';
import { servicesApi } from '@/lib/api/endpoints/services';
import type { ServiceResponse } from '@/lib/api/types/services';
import { useAuthStore } from '@/lib/auth/store';
import { useCartStore } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

// Services require connectivity to add to the cart — see checkout.tsx's
// online-only service checkout path for why (no local Services table to
// resolve price/stock-links from once offline).
export default function ServicePickerScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const addServiceLine = useCartStore((s) => s.addServiceLine);

  const [query, setQuery] = useState('');
  const [services, setServices] = useState<ServiceResponse[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    servicesApi
      .list(companyId)
      .then((all) => setServices(all.filter((s) => s.active)))
      .catch((err) =>
        showAlert(
          'Could not load services',
          err instanceof Error ? err.message : 'Services need an internet connection to add to a sale.',
        ),
      )
      .finally(() => setLoading(false));
  }, [companyId]);

  const results = useMemo(() => {
    if (!services) return [];
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, query]);

  const select = (service: ServiceResponse) => {
    addServiceLine({
      key: service.id,
      serviceId: service.id,
      serviceName: service.name,
      unitPrice: service.fixedPrice,
      stockLinks: service.stockLinks.map((l) => ({
        productId: l.productId,
        quantityConsumedInBaseUnits: l.quantityConsumedInBaseUnits,
      })),
    });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Add a service</Text>
          <View className="w-12" />
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search services"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          renderItem={({ item }) => (
            <Pressable onPress={() => select(item)} className="rounded-xl bg-surface p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{item.name}</Text>
                <Text className="text-sm font-bold text-primary">{formatCurrency(item.fixedPrice, currency)}</Text>
              </View>
              {item.category ? <Text className="text-xs text-text-secondary">{item.category}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text className="p-4 text-center text-sm text-text-secondary">
              {services === null
                ? 'Could not reach the server — services need an internet connection.'
                : services.length === 0
                  ? 'No services set up yet. Add some from More → Services.'
                  : 'No matching services.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
