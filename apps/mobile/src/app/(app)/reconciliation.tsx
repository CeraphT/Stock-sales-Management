import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineNotice } from '@/components/OfflineNotice';
import { ScreenBackground } from '@/components/ScreenBackground';
import { cachedFetch } from '@stockflow/core/local/remoteCache';
import { useStaleNotice } from '@/lib/hooks/useStaleNotice';
import { BackButton } from '@/components/BackButton';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { reconciliationApi, type ReconciliationResponse } from '@/lib/api/endpoints/reconciliation';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';
import { toast } from '@/lib/ui/toastStore';
import { appLocale } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function ReconciliationScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  // Offline B: server-only data — offline, the last answer is shown with its date.
  const { staleAt, setStaleAt, staleMessage } = useStaleNotice();
  const currency = useCompanyCurrency();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setData(await cachedFetch(companyId, 'reconciliation', () => reconciliationApi.get(companyId), setStaleAt));
    } catch (err) {
      toast(err instanceof Error ? err.message : t('recon.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const conflicts = data?.conflictShifts ?? [];
  const negatives = data?.negativeBatches ?? [];

  const acknowledgeOne = async (shiftId: string) => {
    if (!companyId || busy) return;
    setBusy(shiftId);
    try {
      await reconciliationApi.acknowledgeShift(companyId, shiftId);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('recon.updateFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const acknowledgeAll = async () => {
    if (!companyId || busy) return;
    setBusy('all');
    try {
      const res = await reconciliationApi.acknowledgeShiftConflicts(companyId);
      await load();
      toast(t('recon.markedReviewed').replace('{n}', String(res.acknowledged)), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('recon.updateFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('recon.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <OfflineNotice visible={!!staleAt} message={staleMessage} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : conflicts.length === 0 && negatives.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-text-secondary">✓ {t('recon.nothing')}</Text>
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerClassName="gap-4 p-5 pb-10">
          {/* Auto-closed shift conflicts */}
          {conflicts.length > 0 ? (
            <View className="overflow-hidden rounded-card border border-border bg-surface">
              <View className="gap-2 border-b border-border px-4 py-3">
                <Text className="text-sm font-bold text-text-primary">{t('recon.autoClosed')}</Text>
                <Text className="text-xs text-text-secondary">{t('recon.autoClosedHint')}</Text>
                <Pressable
                  onPress={acknowledgeAll}
                  disabled={busy === 'all'}
                  className="mt-1 self-start rounded-lg bg-primary/10 px-3 py-2 active:opacity-80">
                  <Text className="text-xs font-bold text-primary">{busy === 'all' ? '…' : t('recon.markAll')}</Text>
                </Pressable>
              </View>
              {conflicts.map((s) => (
                <View key={s.id} className="flex-row items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text-primary">
                      {s.locationName} · {new Date(s.openedAt).toLocaleString(appLocale())}
                    </Text>
                    <Text className="mt-0.5 text-xs text-text-secondary">
                      {t('recon.openedBy').replace('{name}', s.openedByName)} · {t('recon.float')} {formatCurrency(s.openingCashAmount, currency)}
                      {s.closingCashAmount != null ? ` · ${t('recon.counted')} ${formatCurrency(s.closingCashAmount, currency)}` : ''}
                    </Text>
                    {s.discrepancy != null && s.discrepancy !== 0 ? (
                      <Text className={`mt-0.5 text-xs font-semibold ${s.discrepancy > 0 ? 'text-accent-amber' : 'text-error'}`}>
                        {s.discrepancy > 0 ? t('recon.over') : t('recon.short')} {formatCurrency(Math.abs(s.discrepancy), currency)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => acknowledgeOne(s.id)}
                    disabled={busy === s.id}
                    className="rounded-lg bg-primary/10 px-3 py-2 active:opacity-80">
                    <Text className="text-xs font-bold text-primary">{busy === s.id ? '…' : t('recon.reviewed')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Negative-stock batches */}
          {negatives.length > 0 ? (
            <View className="overflow-hidden rounded-card border border-border bg-surface">
              <View className="gap-1 border-b border-border px-4 py-3">
                <Text className="text-sm font-bold text-text-primary">{t('recon.negativeStock')}</Text>
                <Text className="text-xs text-text-secondary">{t('recon.negativeHint')}</Text>
              </View>
              {negatives.map((b) => (
                <View key={b.id} className="flex-row items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text-primary">{b.productName}</Text>
                    <Text className="mt-0.5 text-xs text-text-secondary">
                      {t('common.batch')} {b.batchNumber || '-'} · {b.locationName} · <Text className="font-semibold text-error">{b.quantityInBaseUnits}</Text>
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: '/stock-adjust', params: { productId: b.productId, batchId: b.id } })}
                    className="rounded-lg bg-primary/10 px-3 py-2 active:opacity-80">
                    <Text className="text-xs font-bold text-primary">{t('recon.adjust')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}
