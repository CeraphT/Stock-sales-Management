import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { suppliersApi } from '@/lib/api/endpoints/suppliers';
import { useAuthStore } from '@/lib/auth/store';
import { showAlert } from '@/lib/ui/alertStore';

export default function SupplierFormScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; contactPhone?: string; contactEmail?: string }>();
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const isEdit = !!params.id;

  const [name, setName] = useState(params.name ?? '');
  const [contactPhone, setContactPhone] = useState(params.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(params.contactEmail ?? '');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a supplier name.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
      };
      if (isEdit && params.id) {
        await suppliersApi.update(companyId, params.id, body);
      } else {
        await suppliersApi.create(companyId, body);
      }
      router.back();
    } catch (err) {
      showAlert('Could not save supplier', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">{isEdit ? 'Edit supplier' : 'Add supplier'}</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField label="Supplier name" value={name} onChangeText={setName} />
        <TextField label="Contact phone" keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} />
        <TextField label="Contact email" autoCapitalize="none" keyboardType="email-address" value={contactEmail} onChangeText={setContactEmail} />

        <Button title={submitting ? 'Saving…' : 'Save supplier'} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
