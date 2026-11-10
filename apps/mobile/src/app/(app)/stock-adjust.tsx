import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { afterOfflineWrite } from '@/lib/sync/afterOfflineWrite';
import { offlineWrites } from '@stockflow/core/local/offlineWrites';
import { showAlert } from '@/lib/ui/alertStore';

export default function StockAdjustScreen() {
  const { productId, batchId } = useLocalSearchParams<{ productId: string; batchId: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  const { t } = useTranslation();

  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId || !productId || !batchId) return;
    const deltaNumber = Number(delta);
    if (!Number.isInteger(deltaNumber) || deltaNumber === 0) {
      showAlert(t('common.invalidQuantity'), t('adjust.invalidQtyBody'));
      return;
    }
    if (!reason.trim()) {
      showAlert(t('adjust.reasonRequired'), t('adjust.reasonRequiredBody'));
      return;
    }

    setSubmitting(true);
    try {
      // Offline-capable: applied to the local batch at once, sent when online.
      await offlineWrites.adjustStock(companyId, productId, {
        batchId,
        deltaInBaseUnits: deltaNumber,
        reason: reason.trim(),
      });
      afterOfflineWrite({ queued: t('offline.queued'), rejected: t('offline.rejected') });
      router.back();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('common.somethingWrong');
      showAlert(t('adjust.failed'), message);
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
          <Text className="text-lg font-bold text-text-primary">{t('adjust.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <KeyboardAwareScroll contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField
          label={t('adjust.qtyLabel')}
          placeholder={t('adjust.qtyPlaceholder')}
          keyboardType="numbers-and-punctuation"
          value={delta}
          onChangeText={setDelta}
        />
        <TextField label={t('adjust.reason')} placeholder={t('adjust.reasonPlaceholder')} value={reason} onChangeText={setReason} />

        <Button title={submitting ? t('adjust.adjusting') : t('adjust.apply')} loading={submitting} onPress={onSubmit} />
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
