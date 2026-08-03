import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonDetail } from '@/components/Skeleton';
import { PurchaseOrderStatus } from '@/lib/api/enums';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import type { PurchaseOrderDetailResponse } from '@/lib/api/types/purchaseOrders';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, purchaseOrderStatusLabel } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { purchaseOrderStatusTone } from '@/lib/purchaseOrderStatusTone';
import { sharePurchaseOrder, viewOrPrintPurchaseOrder } from '@/lib/reports/purchaseOrderActions';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();
  const { name: companyName } = useCompanyInfo();
  const colors = useThemeColors();

  const [order, setOrder] = useState<PurchaseOrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !id) return;
    setLoading(true);
    try {
      setOrder(await purchaseOrdersApi.get(companyId, id));
    } finally {
      setLoading(false);
    }
  }, [companyId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onCancel = () => {
    showAlert('Cancel this order?', 'This can only be done before any receipt has been recorded.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          if (!companyId || !id) return;
          setCancelling(true);
          try {
            await purchaseOrdersApi.cancel(companyId, id);
            await load();
          } catch (err) {
            showAlert('Could not cancel order', err instanceof Error ? err.message : 'Something went wrong.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const toPdfData = () =>
    order
      ? {
          companyName,
          currency,
          id: order.id,
          createdAt: order.createdAt,
          supplierName: order.supplierName,
          locationName: order.locationName,
          status: order.status,
          notes: order.notes,
          lines: order.lines.map((l) => ({
            productName: l.productName,
            quantityOrdered: l.quantityOrdered,
            quantityReceived: l.quantityReceived,
            unitCost: l.unitCost,
          })),
        }
      : null;

  const onView = () => {
    const data = toPdfData();
    if (!data) return;
    viewOrPrintPurchaseOrder(data).catch((err) =>
      showAlert('Could not open PDF', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  const onShare = () => {
    const data = toPdfData();
    if (!data) return;
    sharePurchaseOrder(data).catch((err) =>
      showAlert('Could not share PDF', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  if (loading || !order) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScreenBackground />
        <SkeletonDetail />
      </SafeAreaView>
    );
  }

  const totalCost = order.lines.reduce((sum, l) => sum + l.quantityOrdered * l.unitCost, 0);
  const totalOrdered = order.lines.reduce((sum, l) => sum + l.quantityOrdered, 0);
  const totalReceived = order.lines.reduce((sum, l) => sum + l.quantityReceived, 0);
  const receivedFraction = totalOrdered > 0 ? Math.min(1, totalReceived / totalOrdered) : 0;
  const tone = purchaseOrderStatusTone(order.status, colors);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Purchase order</Text>
          <Pressable onPress={onShare} hitSlop={8} accessibilityLabel="Share PDF">
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5">
        <View className="rounded-2xl bg-surface p-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-base font-bold text-text-primary">{order.supplierName}</Text>
              <Text className="mt-0.5 text-xs text-text-secondary">{order.locationName}</Text>
              <Text className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleString()}</Text>
            </View>
            <View className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${tone.badgeClass}`}>
              <Ionicons name={tone.icon} size={13} color={tone.iconColor} />
              <Text className={`text-xs font-bold ${tone.textClass}`}>{purchaseOrderStatusLabel(order.status)}</Text>
            </View>
          </View>

          {order.notes ? <Text className="mt-3 text-sm text-text-secondary">{order.notes}</Text> : null}

          {order.status !== PurchaseOrderStatus.Cancelled ? (
            <View className="mt-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-text-secondary">
                  {totalReceived} of {totalOrdered} units received
                </Text>
                <Text className="text-xs font-semibold text-text-secondary">{Math.round(receivedFraction * 100)}%</Text>
              </View>
              <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                <View
                  className={`h-2 rounded-full ${order.status === PurchaseOrderStatus.Received ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${Math.round(receivedFraction * 100)}%` }}
                />
              </View>
            </View>
          ) : null}

          <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
            <Text className="text-sm font-semibold text-text-secondary">Order total</Text>
            <Text className="text-base font-bold text-text-primary">{formatCurrency(totalCost, currency)}</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={onView}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3.5 active:opacity-90">
            <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">View / print (PDF)</Text>
          </Pressable>
        </View>

        <Text className="text-sm font-bold text-text-primary">Lines</Text>
        {order.lines.map((line) => {
          const remaining = line.quantityOrdered - line.quantityReceived;
          const lineFraction = line.quantityOrdered > 0 ? Math.min(1, line.quantityReceived / line.quantityOrdered) : 0;
          const lineDone = remaining <= 0;
          return (
            <View key={line.id} className="rounded-xl bg-surface p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{line.productName}</Text>
                {lineDone ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
              </View>
              <Text className="mt-1 text-xs text-text-secondary">
                {line.quantityReceived} / {line.quantityOrdered} received · {formatCurrency(line.unitCost, currency)} each
              </Text>
              <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <View
                  className={`h-1.5 rounded-full ${lineDone ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${Math.round(lineFraction * 100)}%` }}
                />
              </View>
              {remaining > 0 && order.status !== PurchaseOrderStatus.Cancelled ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/po-receive-line',
                      params: { orderId: order.id, lineId: line.id, productName: line.productName, remaining: String(remaining) },
                    })
                  }
                  className="mt-2 self-start rounded-lg border border-primary px-3 py-1.5">
                  <Text className="text-xs font-semibold text-primary">Receive</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {order.status === PurchaseOrderStatus.Pending ? (
          <Button title={cancelling ? 'Cancelling…' : 'Cancel order'} variant="secondary" loading={cancelling} onPress={onCancel} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
