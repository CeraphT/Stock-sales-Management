import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthScreenLayout } from '@/components/AuthScreenLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api/client';
import { companiesApi } from '@/lib/api/endpoints/companies';
import type { CompanyResponse } from '@/lib/api/types/auth';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function JoinCompanyScreen() {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<CompanyResponse | null>(null);

  const onSubmit = async () => {
    if (!code.trim()) {
      showAlert(t('joinCompany.title'), t('joinCompany.missingCode'));
      return;
    }
    setLoading(true);
    try {
      const result = await companiesApi.join({ uniqueCode: code.trim() });
      setCompany(result);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? "No business found with that code — double-check it and try again."
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      showAlert('Could not find business', message);
    } finally {
      setLoading(false);
    }
  };

  if (company) {
    return (
      <AuthScreenLayout icon="checkmark-circle-outline" title={t('joinCompany.foundTitle')} subtitle={company.name}>
        <Text className="text-center text-sm text-text-secondary">
          You're about to join <Text className="font-semibold text-text-primary">{company.name}</Text>. Ask your administrator for a
          staff phone number and password, then log in below.
        </Text>
        <Link href="/login" asChild>
          <View className="rounded-xl bg-primary py-4 active:opacity-90">
            <Text className="text-center text-base font-semibold text-white">{t('joinCompany.continueToLogin')}</Text>
          </View>
        </Link>
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout icon="people-outline" title={t('joinCompany.title')} subtitle={t('joinCompany.subtitle')}>
      <TextField
        label={t('joinCompany.inviteCode')}
        placeholder="e.g. ABC123"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button title={loading ? t('joinCompany.submitting') : t('joinCompany.submit')} onPress={onSubmit} loading={loading} />
    </AuthScreenLayout>
  );
}
