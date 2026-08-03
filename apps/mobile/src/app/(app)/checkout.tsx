import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { salesApi } from '@/lib/api/endpoints/sales';
import { PaymentMethod } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';
import { cartTotal, useCartStore } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { localSalesService } from '@/lib/local/salesService';
import { printingService, NoPrinterConfiguredError } from '@/lib/printer/printingService';
import { viewOrPrintReceipt } from '@/lib/receipt/receiptActions';
import type { ReceiptData } from '@/lib/receipt/receiptTypes';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

const METHODS: { method: PaymentMethod; label: string }[] = [
  { method: PaymentMethod.Cash, label: 'Cash' },
  { method: PaymentMethod.MobileMoney, label: 'Mobile Money' },
  { method: PaymentMethod.Credit, label: 'Credit' },
  { method: PaymentMethod.StoreCredit, label: 'Store credit' },
  { method: PaymentMethod.GiftCard, label: 'Gift card' },
];

export default function CheckoutScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const user = useAuthStore((s) => s.user);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const lines = useCartStore((s) => s.lines);
  const serviceLines = useCartStore((s) => s.serviceLines);
  const customerId = useCartStore((s) => s.customerId);
  const customerName = useCartStore((s) => s.customerName);
  const clearCart = useCartStore((s) => s.clear);

  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Cash);
  const [tendered, setTendered] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = cartTotal(lines, serviceLines);
  const hasServices = serviceLines.length > 0;
  const tenderedNumber = Number(tendered);
  const change = method === PaymentMethod.Cash && tendered.trim() && !Number.isNaN(tenderedNumber) ? tenderedNumber - total : null;

  const needsCustomer = method === PaymentMethod.Credit || method === PaymentMethod.StoreCredit;

  const onCharge = async () => {
    if (!companyId || !locationId) return;
    if (needsCustomer && !customerId) {
      showAlert('Customer required', 'This payment method requires a customer to be selected.');
      return;
    }
    if (method === PaymentMethod.GiftCard && !giftCardCode.trim()) {
      showAlert('Gift card code required', 'Enter the gift card code to redeem.');
      return;
    }

    setSubmitting(true);
    try {
      const request = {
        locationId,
        customerId,
        paymentMethod: method,
        productLines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, packagingLevelId: l.packagingLevelId })),
        serviceLines: hasServices ? serviceLines.map((l) => ({ serviceId: l.serviceId, quantity: l.quantity })) : null,
        paymentSplits: null,
        amountTendered: method === PaymentMethod.Cash && tendered.trim() ? tenderedNumber : null,
        giftCardCode: method === PaymentMethod.GiftCard ? giftCardCode.trim() : null,
      };

      // A cart with services bypasses the offline-first local path — see
      // salesApi.create's note on why (service-line sync was never wired
      // end to end, even in the MAUI client).
      const result = hasServices ? await salesApi.create(companyId, request) : await localSalesService.createSale(companyId, request);

      clearCart();

      // Best-effort, non-blocking — a completed sale is written locally
      // first (offline-first), so Sales History (which reads the server,
      // never the local mirror — see CLAUDE.md) won't show it until a sync
      // push happens. Previously that only happened via the Dashboard's
      // manual pull-to-refresh, which is why the sale seemed to "vanish"
      // until the user detoured through Home. Firing it here means it's
      // usually already pushed by the time the user navigates anywhere.
      syncNow().catch(() => {});

      const receipt: ReceiptData = {
        saleId: result.id,
        timestamp: result.timestamp,
        companyName,
        locationName: locationName ?? '—',
        cashierName: user?.name ?? '—',
        currency,
        paymentMethod: result.paymentMethod,
        productLines: result.productLines.map((l) => ({
          productName: l.productName,
          quantityInBaseUnits: l.quantityInBaseUnits,
          packagingLevelName: l.packagingLevelName,
          unitsPerPackagingLevel: l.unitsPerPackagingLevel,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        serviceLines: result.serviceLines.map((l) => ({
          serviceName: l.serviceName,
          quantity: l.quantity,
          unitPrice: l.billedPrice,
          lineTotal: l.lineTotal,
        })),
        paymentSplits: result.paymentSplits,
        amountTendered: result.amountTendered,
        changeDue: result.changeDue,
        total: result.total,
      };

      showAlert(
        'Sale complete',
        `Total: ${formatCurrency(result.total, currency)}${result.changeDue ? `\nChange due: ${formatCurrency(result.changeDue, currency)}` : ''}`,
        [
          { text: t('common.done'), onPress: () => router.dismissTo('/dashboard') },
          {
            text: t('checkout.printReceipt'),
            onPress: () => {
              printingService.printReceipt(receipt).catch((err) => {
                if (err instanceof NoPrinterConfiguredError) {
                  showAlert('No printer configured', 'Set up a receipt printer first.', [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Set up printer', onPress: () => router.push('/printer-settings') },
                  ]);
                  return;
                }
                showAlert('Could not print', err instanceof Error ? err.message : 'Something went wrong.');
              });
            },
          },
          {
            text: t('checkout.viewReceipt'),
            onPress: () => {
              viewOrPrintReceipt(receipt).catch((err) =>
                showAlert('Could not open receipt', err instanceof Error ? err.message : 'Something went wrong.'),
              );
            },
          },
        ],
      );
    } catch (err) {
      showAlert('Could not complete sale', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('checkout.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-5 p-5">
        <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
          <Text className="text-sm text-text-secondary">{t('checkout.totalDue')}</Text>
          <Text className="text-3xl font-bold text-text-primary">{formatCurrency(total, currency)}</Text>
          <Text className="mt-1 text-xs text-text-secondary">
            {t('checkout.customerLabel')}: {customerName ?? t('common.walkIn')}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('checkout.paymentMethod')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {METHODS.map((m) => (
              <Pressable
                key={m.method}
                onPress={() => setMethod(m.method)}
                className={`rounded-xl border px-4 py-2.5 ${method === m.method ? 'border-primary bg-primary' : 'border-border bg-surface'}`}>
                <Text className={`text-sm font-semibold ${method === m.method ? 'text-white' : 'text-text-primary'}`}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {method === PaymentMethod.Cash ? (
          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('checkout.amountTendered')}</Text>
            <TextInput
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder={`e.g. ${total}`}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={tendered}
              onChangeText={setTendered}
            />
            {change !== null ? (
              <Text className={`text-sm font-semibold ${change < 0 ? 'text-error' : 'text-success'}`}>
                {change < 0
                  ? `${t('checkout.shortBy')} ${formatCurrency(Math.abs(change), currency)}`
                  : `${t('checkout.changeDue')}: ${formatCurrency(change, currency)}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {method === PaymentMethod.GiftCard ? (
          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('checkout.giftCardCode')}</Text>
            <TextInput
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder="e.g. ABC123"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              value={giftCardCode}
              onChangeText={setGiftCardCode}
            />
          </View>
        ) : null}

        {needsCustomer && !customerId ? (
          <Text className="text-sm text-error">{t('checkout.customerRequired')}</Text>
        ) : null}

        <Button
          title={submitting ? t('checkout.processing') : `${t('pos.charge')} ${formatCurrency(total, currency)}`}
          loading={submitting}
          onPress={onCharge}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
