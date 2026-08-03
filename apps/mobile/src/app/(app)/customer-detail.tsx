import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonDetail } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { customersApi } from '@/lib/api/endpoints/customers';
import type { CustomerResponse } from '@/lib/api/types/customers';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { showAlert } from '@/lib/ui/alertStore';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCustomers));
  const currency = useCompanyCurrency();

  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !id) return;
    setLoading(true);
    try {
      const all = await customersApi.list(companyId);
      setCustomer(all.find((c) => c.id === id) ?? null);
    } catch (err) {
      showAlert('Could not load customer', err instanceof Error ? err.message : 'Something went wrong.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [companyId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRedeem = async () => {
    if (!companyId || !id || !customer) return;
    const pointsToRedeem = Number(points);
    if (!Number.isInteger(pointsToRedeem) || pointsToRedeem <= 0) {
      showAlert('Invalid points', 'Enter a positive whole number of points.');
      return;
    }
    if (pointsToRedeem > customer.loyaltyPointsBalance) {
      showAlert('Not enough points', `This customer only has ${customer.loyaltyPointsBalance} points.`);
      return;
    }
    setRedeeming(true);
    try {
      await customersApi.redeemLoyalty(companyId, id, { points: pointsToRedeem });
      setPoints('');
      await load();
      showAlert('Redeemed', 'Points converted to store credit.');
    } catch (err) {
      showAlert('Could not redeem', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading || !customer) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScreenBackground />
        <SkeletonDetail />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Customer</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5">
        <View className="rounded-2xl bg-surface p-4">
          <Text className="text-lg font-bold text-text-primary">{customer.name}</Text>
          <Text className="text-sm text-text-secondary">{customer.phone ?? 'No phone on file'}</Text>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-surface p-4">
            <Text className="text-xs uppercase tracking-wide text-text-secondary">Credit balance</Text>
            <Text className="mt-1 text-base font-bold text-text-primary">{formatCurrency(customer.creditBalance, currency)}</Text>
          </View>
          <View className="flex-1 rounded-2xl bg-surface p-4">
            <Text className="text-xs uppercase tracking-wide text-text-secondary">Store credit</Text>
            <Text className="mt-1 text-base font-bold text-text-primary">
              {formatCurrency(customer.loyaltyStoreCreditBalance, currency)}
            </Text>
          </View>
        </View>

        <View className="rounded-2xl bg-surface p-4">
          <Text className="text-xs uppercase tracking-wide text-text-secondary">Loyalty points</Text>
          <Text className="mt-1 text-2xl font-bold text-primary">{customer.loyaltyPointsBalance}</Text>

          <View className="mt-4 gap-3">
            <TextField label="Redeem points" placeholder="0" keyboardType="numeric" value={points} onChangeText={setPoints} />
            <Button title={redeeming ? 'Redeeming…' : 'Redeem for store credit'} loading={redeeming} onPress={onRedeem} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
