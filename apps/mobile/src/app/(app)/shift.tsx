import { paymentMethodLabel } from '@stockflow/core/format';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { PaymentMethod, ShiftStatus } from '@/lib/api/enums';
import type { ShiftDetailResponse } from '@/lib/api/types/shifts';
import { useAuthStore } from '@/lib/auth/store';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { buildDailyRows, printCashReport } from '@/lib/cashReport';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { localShiftService } from '@/lib/local/shiftService';
import { useThemeColors } from '@/lib/theme/colors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

function methodTotal(shift: ShiftDetailResponse, method: PaymentMethod): number {
  return shift.paymentBreakdown.find((b) => b.method === method)?.total ?? 0;
}

export default function ShiftScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCashRegister));
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [shift, setShift] = useState<ShiftDetailResponse | null>(null);
  const [history, setHistory] = useState<ShiftDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const refresh = async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const [current, hist] = await Promise.all([
        localShiftService.getCurrentShift(companyId, locationId),
        localShiftService.getShiftHistory(companyId, locationId),
      ]);
      setShift(current);
      setHistory(hist);
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
      toast('Cash register opened.', 'success');
      await refresh();
    } catch (err) {
      showAlert('Could not open the register', err instanceof Error ? err.message : 'Something went wrong.');
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
      const d = closed.discrepancy ?? 0;
      toast(
        d === 0
          ? 'Register closed — cash balanced.'
          : `Register closed — ${d > 0 ? 'over' : 'short'} by ${formatCurrency(Math.abs(d), currency)}.`,
        d === 0 ? 'success' : 'info',
      );
      await refresh();
    } catch (err) {
      showAlert('Could not close the register', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const expectedCash = shift ? shift.openingCashAmount + methodTotal(shift, PaymentMethod.Cash) : 0;
  const liveDiscrepancy = closingCash.trim() ? (Number(closingCash) || 0) - expectedCash : null;

  const closedHistory = useMemo(() => history.filter((h) => h.status === ShiftStatus.Closed), [history]);
  const dailyRows = useMemo(() => {
    const inRange = closedHistory.filter((h) => {
      const d = h.openedAt.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    return buildDailyRows(inRange);
  }, [closedHistory, from, to]);

  const totCash = dailyRows.reduce((s, r) => s + r.cash, 0);
  const totMobile = dailyRows.reduce((s, r) => s + r.mobile, 0);
  const totAll = dailyRows.reduce((s, r) => s + r.total, 0);

  const onPrint = async () => {
    try {
      await printCashReport(dailyRows, companyName, currency, from, to);
    } catch (err) {
      showAlert('Could not print', err instanceof Error ? err.message : 'Something went wrong.');
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
        <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
          {shift ? (
            <View className="rounded-card border border-border bg-surface p-5">
              {/* Open header */}
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <View className="h-2.5 w-2.5 rounded-full bg-success" />
                    <Text className="text-lg font-bold text-text-primary">Register open</Text>
                  </View>
                  <Text className="mt-0.5 text-xs text-text-secondary">
                    {locationName ?? shift.locationName} · opened {new Date(shift.openedAt).toLocaleString()} by {shift.openedByName}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs uppercase tracking-wide text-text-secondary">Opening float</Text>
                  <Text className="text-lg font-bold text-text-primary">{formatCurrency(shift.openingCashAmount, currency)}</Text>
                </View>
              </View>

              {/* Cash vs mobile money */}
              <View className="mt-4 flex-row gap-3">
                <View className="flex-1 rounded-xl border border-border/60 bg-background/50 p-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">💵 Cash sales</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-text-primary">{formatCurrency(methodTotal(shift, PaymentMethod.Cash), currency)}</Text>
                  <Text className="mt-1 text-xs text-text-secondary">Expected in drawer: {formatCurrency(expectedCash, currency)}</Text>
                </View>
                <View className="flex-1 rounded-xl border border-border/60 bg-background/50 p-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">📱 Mobile money</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-text-primary">{formatCurrency(methodTotal(shift, PaymentMethod.MobileMoney), currency)}</Text>
                  <Text className="mt-1 text-xs text-text-secondary">Not in the cash drawer</Text>
                </View>
              </View>

              {/* All tenders */}
              {shift.paymentBreakdown.length > 0 ? (
                <View className="mt-3 gap-1.5 rounded-xl border border-border/60 p-3">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    All tenders · {shift.salesCount} {shift.salesCount === 1 ? 'sale' : 'sales'}
                  </Text>
                  {shift.paymentBreakdown.map((b) => (
                    <View key={b.method} className="flex-row items-center justify-between">
                      <Text className="text-sm text-text-secondary">{paymentMethodLabel(b.method)}</Text>
                      <Text className="text-sm font-semibold text-text-primary">{formatCurrency(b.total, currency)}</Text>
                    </View>
                  ))}
                  <View className="mt-1 flex-row items-center justify-between border-t border-border/60 pt-1.5">
                    <Text className="text-sm font-semibold text-text-primary">Total sales</Text>
                    <Text className="text-sm font-bold text-text-primary">{formatCurrency(shift.totalSales, currency)}</Text>
                  </View>
                </View>
              ) : (
                <Text className="mt-3 text-sm text-text-secondary">No sales on this shift yet.</Text>
              )}

              {/* Close */}
              <View className="mt-4 border-t border-border pt-4">
                <Text className="text-sm font-bold text-text-primary">Close register</Text>
                <Text className="mb-2 text-xs text-text-secondary">Count the physical cash in the drawer — mobile money is not counted here.</Text>
                <View className="gap-1.5">
                  <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Cash counted</Text>
                  <TextInput
                    className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                    placeholder={String(Math.round(expectedCash))}
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numeric"
                    value={closingCash}
                    onChangeText={setClosingCash}
                  />
                </View>
                <View className="mt-3 gap-1.5">
                  <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Notes (optional)</Text>
                  <TextInput
                    className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                    placeholder="Any discrepancy notes"
                    placeholderTextColor={colors.placeholder}
                    value={closingNotes}
                    onChangeText={setClosingNotes}
                  />
                </View>
                {liveDiscrepancy !== null ? (
                  <Text className="mt-2 text-sm text-text-secondary">
                    Expected {formatCurrency(expectedCash, currency)} ·{' '}
                    <Text
                      className={`font-bold ${liveDiscrepancy === 0 ? 'text-success' : liveDiscrepancy > 0 ? 'text-accent-amber' : 'text-error'}`}>
                      {liveDiscrepancy === 0
                        ? 'balanced'
                        : liveDiscrepancy > 0
                          ? `over by ${formatCurrency(liveDiscrepancy, currency)}`
                          : `short by ${formatCurrency(-liveDiscrepancy, currency)}`}
                    </Text>
                  </Text>
                ) : null}
                <View className="mt-3">
                  <Button
                    title={submitting ? t('shift.closing') : 'Close register'}
                    variant="danger"
                    loading={submitting}
                    disabled={!closingCash.trim()}
                    onPress={onClose}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View className="rounded-card border border-border bg-surface p-5">
              <Text className="text-lg font-bold text-text-primary">Register closed</Text>
              <Text className="mb-3 mt-1 text-sm text-text-secondary">Open the register with the cash float you're starting the day with.</Text>
              <View className="gap-1.5">
                <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Opening cash float</Text>
                <TextInput
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  value={openingCash}
                  onChangeText={setOpeningCash}
                />
              </View>
              <View className="mt-3">
                <Button title={submitting ? t('shift.opening') : 'Open register'} loading={submitting} onPress={onOpen} />
              </View>
            </View>
          )}

          {/* Daily takings */}
          <View className="overflow-hidden rounded-card border border-border bg-surface">
            <View className="gap-2 border-b border-border px-4 py-3">
              <Text className="text-sm font-bold text-text-primary">Daily takings</Text>
              <View className="flex-row items-end gap-2">
                <View className="flex-1">
                  <DateField label="From" value={from || null} onChange={setFrom} placeholder="Any" />
                </View>
                <View className="flex-1">
                  <DateField label="To" value={to || null} onChange={setTo} placeholder="Any" />
                </View>
              </View>
              <Button title="🖨  Print report" variant="secondary" disabled={dailyRows.length === 0} onPress={onPrint} />
            </View>
            {dailyRows.length === 0 ? (
              <Text className="p-8 text-center text-sm text-text-secondary">No takings in this range.</Text>
            ) : (
              <View>
                <View className="flex-row border-b border-border px-4 py-2">
                  <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Day</Text>
                  <Text className="w-24 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">💵 Cash</Text>
                  <Text className="w-24 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">📱 Mobile</Text>
                  <Text className="w-24 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">Total</Text>
                </View>
                {dailyRows.map((r) => (
                  <View key={r.date} className="flex-row items-center border-b border-border/60 px-4 py-2.5">
                    <Text className="flex-1 text-sm text-text-primary">{new Date(`${r.date}T00:00:00`).toLocaleDateString()}</Text>
                    <Text className="w-24 text-right text-sm text-text-primary">{formatCurrency(r.cash, currency)}</Text>
                    <Text className="w-24 text-right text-sm text-text-primary">{formatCurrency(r.mobile, currency)}</Text>
                    <Text className="w-24 text-right text-sm font-semibold text-text-primary">{formatCurrency(r.total, currency)}</Text>
                  </View>
                ))}
                <View className="flex-row items-center border-t-2 border-border px-4 py-2.5">
                  <Text className="flex-1 text-sm font-bold text-text-primary">Total</Text>
                  <Text className="w-24 text-right text-sm font-bold text-text-primary">{formatCurrency(totCash, currency)}</Text>
                  <Text className="w-24 text-right text-sm font-bold text-text-primary">{formatCurrency(totMobile, currency)}</Text>
                  <Text className="w-24 text-right text-sm font-bold text-text-primary">{formatCurrency(totAll, currency)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Shift history */}
          <View className="overflow-hidden rounded-card border border-border bg-surface">
            <Text className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">Shift history</Text>
            {closedHistory.length === 0 ? (
              <Text className="p-8 text-center text-sm text-text-secondary">No closed shifts yet.</Text>
            ) : (
              closedHistory.map((h) => {
                const d = h.discrepancy;
                return (
                  <View key={h.id} className="border-b border-border/60 px-4 py-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-text-primary">{new Date(h.openedAt).toLocaleDateString()}</Text>
                      <Text className="text-sm font-bold text-text-primary">{formatCurrency(h.totalSales, currency)}</Text>
                    </View>
                    <Text className="mt-0.5 text-xs text-text-secondary">by {h.openedByName}</Text>
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-xs text-text-secondary">
                        💵 {formatCurrency(methodTotal(h, PaymentMethod.Cash), currency)} · 📱 {formatCurrency(methodTotal(h, PaymentMethod.MobileMoney), currency)}
                      </Text>
                      {d == null || d === 0 ? (
                        <Text className="text-xs font-semibold text-success">balanced</Text>
                      ) : (
                        <Text className={`text-xs font-semibold ${d > 0 ? 'text-accent-amber' : 'text-error'}`}>{formatCurrency(d, currency)}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
