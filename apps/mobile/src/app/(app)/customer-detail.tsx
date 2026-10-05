import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineNotice } from '@/components/OfflineNotice';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonDetail } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { SaleStatus } from '@/lib/api/enums';
import { NetworkError } from '@/lib/api/client';
import { customersApi } from '@/lib/api/endpoints/customers';
import { localMirrorQueries } from '@stockflow/core/local/mirrorQueries';
import type { CustomerCreditEntry, CustomerResponse } from '@/lib/api/types/customers';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const { t } = useTranslation();
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCustomers));
  const currency = useCompanyCurrency();

  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [history, setHistory] = useState<CustomerCreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  // Offline: the customer card (balance, points) comes from the local mirror;
  // the credit history is server-only, so it's just flagged as unavailable.
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !id) {
      setLoading(false);
      return;
    }
    let local: CustomerResponse | null = null;
    try {
      local = await localMirrorQueries.getCustomer(companyId, id);
      if (local) {
        setCustomer(local);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const [all, creditHistory] = await Promise.all([
        customersApi.list(companyId),
        customersApi.creditHistory(companyId, id),
      ]);
      setCustomer(all.find((c) => c.id === id) ?? local);
      setHistory(creditHistory.entries);
      setOffline(false);
    } catch (err) {
      if (err instanceof NetworkError && local) {
        setOffline(true);
      } else {
        showAlert('Could not load customer', err instanceof Error ? err.message : 'Something went wrong.');
        if (!local) router.back();
      }
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

      <OfflineNotice visible={offline} message={t('offline.creditHistory')} />
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

        {/* Credit statement — the sales that make up the owed / store-credit
            balances. Tap one to open the full sale. */}
        <View className="overflow-hidden rounded-2xl bg-surface">
          <Text className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">Credit statement</Text>
          {history.length === 0 ? (
            <Text className="p-4 text-center text-xs text-text-secondary">No credit or store-credit activity yet.</Text>
          ) : (
            history.map((entry) => (
              <Pressable
                key={entry.saleId}
                onPress={() => router.push({ pathname: '/sale-detail', params: { id: entry.saleId } })}
                className="border-b border-border/60 px-4 py-3 active:opacity-70">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-secondary">{new Date(entry.timestamp).toLocaleString()}</Text>
                  {entry.status === SaleStatus.Refunded ? (
                    <Text className="text-[10px] font-bold text-error">REFUNDED</Text>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-sm text-text-primary" numberOfLines={2}>
                  {entry.items || `Sale of ${formatCurrency(entry.total, currency)}`}
                </Text>
                <View className="mt-1 flex-row flex-wrap gap-x-3">
                  {entry.creditAmount > 0 ? (
                    <Text className="text-xs font-semibold text-error">On account: {formatCurrency(entry.creditAmount, currency)}</Text>
                  ) : null}
                  {entry.storeCreditAmount > 0 ? (
                    <Text className="text-xs font-semibold text-success">Store credit used: {formatCurrency(entry.storeCreditAmount, currency)}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
