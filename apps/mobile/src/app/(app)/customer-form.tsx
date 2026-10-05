import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { afterOfflineWrite } from '@/lib/sync/afterOfflineWrite';
import { offlineWrites } from '@stockflow/core/local/offlineWrites';
import { useAuthStore } from '@/lib/auth/store';
import { showAlert } from '@/lib/ui/alertStore';

export default function CustomerFormScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { t } = useTranslation();
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCustomers));

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a customer name.');
      return;
    }
    setSubmitting(true);
    try {
      // Offline-capable: the customer exists locally at once (pickable at the
      // POS, credit sales included) and is created on the server when online.
      await offlineWrites.createCustomer(companyId, {
        name: name.trim(),
        phone: phone.trim() || null,
        isBusiness,
        taxId: isBusiness ? taxId.trim() || null : null,
      });
      afterOfflineWrite({ queued: t('offline.queued'), rejected: t('offline.rejected') });
      router.back();
    } catch (err) {
      showAlert('Could not create customer', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Add customer</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField label="Customer name" value={name} onChangeText={setName} />
        <TextField label="Phone (optional)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-text-primary">Business customer</Text>
            <Text className="text-xs text-text-secondary">Enables a compliant invoice with the buyer's Tax ID (VAT added on top).</Text>
          </View>
          <Switch value={isBusiness} onValueChange={setIsBusiness} trackColor={{ true: '#0F766E' }} />
        </View>
        {isBusiness ? <TextField label="Tax ID / NIU" value={taxId} onChangeText={setTaxId} /> : null}

        <Button title={submitting ? 'Creating…' : 'Create customer'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
