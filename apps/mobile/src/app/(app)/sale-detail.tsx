import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { SkeletonDetail } from '@/components/Skeleton';
import { salesApi } from '@/lib/api/endpoints/sales';
import { SaleStatus, UserRole } from '@/lib/api/enums';
import type { SaleDetailResponse } from '@/lib/api/types/sales';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabel } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { printingService, NoPrinterConfiguredError } from '@/lib/printer/printingService';
import { shareReceipt, viewOrPrintReceipt } from '@/lib/receipt/receiptActions';
import type { ReceiptData } from '@/lib/receipt/receiptTypes';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const userRole = useAuthStore((s) => s.user?.role);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();

  const [sale, setSale] = useState<SaleDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(() => {
    if (!companyId || !id) return;
    setLoading(true);
    salesApi
      .detail(companyId, id)
      .then(setSale)
      .catch((err) => showAlert('Could not load sale', err instanceof Error ? err.message : 'Something went wrong.'))
      .finally(() => setLoading(false));
  }, [companyId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canRefund = userRole === UserRole.CompanyAdmin || userRole === UserRole.SuperAdmin;

  const onRefund = () => {
    if (!companyId || !id) return;
    showAlert(
      'Refund this sale?',
      'Stock is returned to inventory and any credit, gift card, or store credit used is reversed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: async () => {
            setRefunding(true);
            try {
              await salesApi.refund(companyId, id);
              load();
              showAlert('Refunded', 'The sale has been refunded and stock restored.');
            } catch (err) {
              showAlert('Could not refund', err instanceof Error ? err.message : 'Something went wrong.');
            } finally {
              setRefunding(false);
            }
          },
        },
      ],
    );
  };

  const toReceiptData = (): ReceiptData | null => {
    if (!sale) return null;
    return {
      saleId: sale.id,
      timestamp: sale.timestamp,
      companyName,
      locationName: sale.locationName,
      cashierName: sale.cashierName,
      currency,
      paymentMethod: sale.paymentMethod,
      productLines: sale.productLines.map((l) => ({
        productName: l.productName,
        quantityInBaseUnits: l.quantityInBaseUnits,
        packagingLevelName: l.packagingLevelName,
        unitsPerPackagingLevel: l.unitsPerPackagingLevel,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      serviceLines: sale.serviceLines.map((l) => ({
        serviceName: l.serviceName,
        quantity: l.quantity,
        unitPrice: l.billedPrice,
        lineTotal: l.lineTotal,
      })),
      paymentSplits: sale.paymentSplits,
      amountTendered: sale.amountTendered,
      changeDue: sale.changeDue,
      total: sale.total,
      // Makes the receipt double as a compliant B2B invoice (same as desktop):
      // invoice number + seller/buyer NIU + VAT. B2B adds VAT on top (rate/100),
      // B2C extracts it from the inclusive price (rate/(100+rate)).
      taxTotal: sale.productLines.reduce((s, l) => {
        if (l.taxRatePercent <= 0) return s;
        return s + (sale.taxAddedOnTop ? (l.lineTotal * l.taxRatePercent) / 100 : (l.lineTotal * l.taxRatePercent) / (100 + l.taxRatePercent));
      }, 0),
      customerTaxId: sale.customerTaxId,
      invoiceNumber: sale.invoiceNumber,
      sellerTaxId: sale.sellerTaxId,
    };
  };

  const onView = () => {
    const data = toReceiptData();
    if (!data) return;
    viewOrPrintReceipt(data).catch((err) =>
      showAlert('Could not open receipt', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  const onShare = () => {
    const data = toReceiptData();
    if (!data) return;
    shareReceipt(data).catch((err) =>
      showAlert('Could not share receipt', err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  const onPrint = () => {
    const data = toReceiptData();
    if (!data) return;
    printingService.printReceipt(data).catch((err) => {
      if (err instanceof NoPrinterConfiguredError) {
        showAlert('No printer configured', 'Set up a receipt printer first.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Set up printer', onPress: () => router.push('/printer-settings') },
        ]);
        return;
      }
      showAlert('Could not print', err instanceof Error ? err.message : 'Something went wrong.');
    });
  };

  if (loading || !sale) {
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
          <Text className="text-lg font-bold text-text-primary">Sale receipt</Text>
          <Pressable onPress={onShare} hitSlop={8} accessibilityLabel="Share receipt PDF">
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5">
        <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
          <Text className="text-sm text-text-secondary">Total</Text>
          <Text className="text-3xl font-bold text-text-primary">{formatCurrency(sale.total, currency)}</Text>
          <Text className="mt-2 text-xs text-text-secondary">
            {sale.cashierName} · {sale.locationName}
          </Text>
          <Text className="text-xs text-text-secondary">{new Date(sale.timestamp).toLocaleString()}</Text>
          <Text className="mt-1 text-xs font-semibold text-primary">{paymentMethodLabel(sale.paymentMethod)}</Text>
          {sale.amountTendered != null ? (
            <Text className="text-xs text-text-secondary">
              Tendered {formatCurrency(sale.amountTendered, currency)} · Change {formatCurrency(sale.changeDue ?? 0, currency)}
            </Text>
          ) : null}
          {sale.status === SaleStatus.Refunded ? (
            <View className="mt-2 self-start rounded-full bg-error/10 px-2.5 py-1">
              <Text className="text-xs font-bold text-error">Refunded</Text>
            </View>
          ) : null}
        </View>

        {canRefund && sale.status === SaleStatus.Completed ? (
          <Pressable
            onPress={onRefund}
            disabled={refunding}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-error py-3.5 active:opacity-80 disabled:opacity-50">
            <Ionicons name="return-up-back-outline" size={18} color={colors.error} />
            <Text className="text-sm font-semibold text-error">{refunding ? 'Refunding…' : 'Refund this sale'}</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onView} className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3.5 active:opacity-90">
          <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">View / print receipt (PDF)</Text>
        </Pressable>
        <Pressable
          onPress={onPrint}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-primary py-3.5 active:opacity-80">
          <Ionicons name="print-outline" size={18} color={colors.primary} />
          <Text className="text-sm font-semibold text-primary">Print on receipt printer</Text>
        </Pressable>

        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Items</Text>
          {sale.productLines.map((line, index) => (
            <View key={`${line.productId}-${index}`} className="rounded-xl bg-surface p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{line.productName}</Text>
                <Text className="text-sm font-bold text-text-primary">{formatCurrency(line.lineTotal, currency)}</Text>
              </View>
              <Text className="text-xs text-text-secondary">
                {line.packagingLevelName ? `${line.quantityInBaseUnits / line.unitsPerPackagingLevel} ${line.packagingLevelName}` : `${line.quantityInBaseUnits} units`}{' '}
                × {formatCurrency(line.unitPrice, currency)}
              </Text>
            </View>
          ))}
          {sale.serviceLines.map((line, index) => (
            <View key={`${line.serviceId}-${index}`} className="rounded-xl bg-accent-purple-soft p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">{line.serviceName}</Text>
                <Text className="text-sm font-bold text-text-primary">{formatCurrency(line.lineTotal, currency)}</Text>
              </View>
              <Text className="text-xs text-text-secondary">
                {line.quantity} × {formatCurrency(line.billedPrice, currency)}
              </Text>
            </View>
          ))}
        </View>

        {sale.paymentSplits.length > 0 ? (
          <View className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Payment breakdown</Text>
            {sale.paymentSplits.map((split, index) => (
              <View key={index} className="flex-row items-center justify-between rounded-xl bg-surface p-3">
                <Text className="text-sm text-text-primary">{paymentMethodLabel(split.method)}</Text>
                <Text className="text-sm font-semibold text-text-primary">{formatCurrency(split.amount, currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
