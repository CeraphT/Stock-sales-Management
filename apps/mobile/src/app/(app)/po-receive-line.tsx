import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { TextField } from '@/components/TextField';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { purchaseOrdersApi } from '@/lib/api/endpoints/purchaseOrders';
import { useAuthStore } from '@/lib/auth/store';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { useCapabilities } from '@/lib/useCapabilities';
import { showAlert } from '@/lib/ui/alertStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function PoReceiveLineScreen() {
  const { orderId, lineId, productName, remaining, serialTracked: serialParam } = useLocalSearchParams<{
    orderId: string;
    lineId: string;
    productName: string;
    remaining: string;
    serialTracked: string;
  }>();
  const companyId = useAuthStore((s) => s.companyId);
  const { t } = useTranslation();
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const caps = useCapabilities();

  const serialTracked = serialParam === '1';
  const expiryRequired = caps.expiryTracking;
  const maxQty = Number(remaining ?? '0');

  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(serialTracked ? '' : (remaining ?? ''));
  const [serialText, setSerialText] = useState('');
  const [actualUnitCost, setActualUnitCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Serial-tracked lines: one IMEI per line, so the count IS the quantity.
  const serials = serialText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  const qty = serialTracked ? serials.length : Number(quantity) || 0;

  const onSubmit = async () => {
    if (!companyId || !orderId || !lineId) return;
    if (!batchNumber.trim()) {
      showAlert(t('receiveLine.missingBatch'), t('receiveLine.missingBatchBody'));
      return;
    }
    if (expiryRequired && !expiryDate) {
      showAlert(t('receiveLine.missingExpiry'), t('receiveLine.missingExpiryBody'));
      return;
    }
    if (serialTracked ? serials.length <= 0 : !Number.isInteger(qty) || qty <= 0) {
      showAlert(t('common.invalidQuantity'), serialTracked ? t('receiveLine.needSerial') : t('bulk.err.qty'));
      return;
    }
    // More than ordered (bonus units, rounded cartons) is allowed after a confirm.
    if (qty > maxQty) {
      showAlert(t('receiveLine.moreThanOrdered'), t('receiveLine.moreThanOrderedBody').replace('{qty}', String(qty)).replace('{max}', String(maxQty)), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('po.receive'), onPress: () => void receive() },
      ]);
      return;
    }
    await receive();
  };

  const receive = async () => {
    if (!companyId || !orderId || !lineId) return;
    setSubmitting(true);
    try {
      await purchaseOrdersApi.receiveLine(companyId, orderId, lineId, {
        quantityReceivedNow: qty,
        batchNumber: batchNumber.trim(),
        expiryDate: expiryDate ? `${expiryDate}T00:00:00.000Z` : null,
        actualUnitCost: actualUnitCost.trim() ? Number(actualUnitCost) : null,
        serialNumbers: serialTracked ? serials : undefined,
      });
      await syncNow();
      router.back();
    } catch (err) {
      showAlert(t('receiveLine.failed'), err instanceof Error ? err.message : t('common.somethingWrong'));
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
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.receiveStock')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <KeyboardAwareScroll contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <Text className="text-sm font-semibold text-text-primary">{productName}</Text>
        <Text className="text-xs text-text-secondary">{t('receiveLine.upTo').replace('{n}', String(remaining))}</Text>

        <TextField label={t('receive.batchLabel')} placeholder={`${t('common.eg')} LOT-2026-07`} value={batchNumber} onChangeText={setBatchNumber} />
        <DateField label={expiryRequired ? t('receive.expiry') : t('receive.expiryOptional')} value={expiryDate} onChange={setExpiryDate} minimumDate={new Date()} />

        {serialTracked ? (
          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('receive.serialsLabel')}</Text>
            <TextInput
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder={'SN-0001\nSN-0002'}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              multiline
              numberOfLines={6}
              style={{ minHeight: 120, textAlignVertical: 'top' }}
              value={serialText}
              onChangeText={setSerialText}
            />
            <Text className="text-xs text-text-secondary">
              {t('receive.serialsCount').replace('{n}', String(serials.length))}
              {serials.length > maxQty ? ` · ${t('receiveLine.moreThanRemaining').replace('{n}', String(maxQty))}` : ''}
            </Text>
          </View>
        ) : (
          <TextField label={t('receiveLine.qtyNow')} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        )}

        <TextField
          label={t('receiveLine.actualCost').replace('{currency}', currency)}
          placeholder={t('receiveLine.actualCostPlaceholder')}
          keyboardType="numeric"
          value={actualUnitCost}
          onChangeText={setActualUnitCost}
        />

        <Button title={submitting ? t('receive.receiving') : t('drawer.item.receiveStock')} loading={submitting} onPress={onSubmit} />
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
