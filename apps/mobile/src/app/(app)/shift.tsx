import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import type { ShiftDetailResponse } from '@/lib/api/types/shifts';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localShiftService } from '@/lib/local/shiftService';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function ShiftScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [shift, setShift] = useState<ShiftDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      setShift(await localShiftService.getCurrentShift(companyId, locationId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, locationId]);

  const onOpen = async () => {
    if (!companyId || !locationId) return;
    const amount = Number(openingCash || '0');
    if (Number.isNaN(amount) || amount < 0) {
      showAlert('Invalid amount', 'Enter a valid opening cash amount.');
      return;
    }
    setSubmitting(true);
    try {
      await localShiftService.openShift(companyId, locationId, amount);
      setOpeningCash('');
      await refresh();
    } catch (err) {
      showAlert('Could not open shift', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const onClose = async () => {
    if (!companyId || !shift) return;
    const amount = Number(closingCash || '0');
    if (Number.isNaN(amount) || amount < 0) {
      showAlert('Invalid amount', 'Enter a valid closing cash amount.');
      return;
    }
    setSubmitting(true);
    try {
      const closed = await localShiftService.closeShift(companyId, shift.id, amount, closingNotes.trim() || null);
      setClosingCash('');
      setClosingNotes('');
      showAlert(
        'Shift closed',
        `Expected: ${closed.expectedCashAmount != null ? formatCurrency(closed.expectedCashAmount, currency) : '—'}\nCounted: ${closed.closingCashAmount != null ? formatCurrency(closed.closingCashAmount, currency) : '—'}\nDiscrepancy: ${closed.discrepancy != null ? formatCurrency(closed.discrepancy, currency) : '—'}`,
      );
      await refresh();
    } catch (err) {
      showAlert('Could not close shift', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">{t('shift.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      {loading ? null : (
        <ScrollView contentContainerClassName="gap-5 p-5">
          {shift ? (
            <>
              <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-success">Open</Text>
                <Text className="mt-1 text-sm text-text-secondary">{t('shift.openingCash')}</Text>
                <Text className="text-2xl font-bold text-text-primary">{formatCurrency(shift.openingCashAmount, currency)}</Text>
                <Text className="mt-2 text-xs text-text-secondary">Opened by {shift.openedByName}</Text>
                <Text className="text-xs text-text-secondary">
                  {t('shift.salesSoFar')}: {shift.salesCount} · {formatCurrency(shift.totalSales, currency)}
                </Text>
              </View>

              <View className="gap-1.5">
                <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('shift.closingCash')}</Text>
                <TextInput
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                  placeholder="Count the till and enter total"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  value={closingCash}
                  onChangeText={setClosingCash}
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Notes (optional)</Text>
                <TextInput
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                  placeholder="Any discrepancy notes"
                  placeholderTextColor={colors.placeholder}
                  value={closingNotes}
                  onChangeText={setClosingNotes}
                />
              </View>
              <Button title={submitting ? t('shift.closing') : t('shift.close')} variant="secondary" loading={submitting} onPress={onClose} />
            </>
          ) : (
            <>
              <View className="rounded-2xl bg-surface p-5 shadow-sm shadow-black/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Closed</Text>
                <Text className="mt-1 text-sm text-text-secondary">{t('shift.noShift')}</Text>
              </View>

              <View className="gap-1.5">
                <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('shift.openingCash')}</Text>
                <TextInput
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                  placeholder="Count the starting float"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  value={openingCash}
                  onChangeText={setOpeningCash}
                />
              </View>
              <Button title={submitting ? t('shift.opening') : t('shift.open')} loading={submitting} onPress={onOpen} />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
