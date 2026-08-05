import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthLayout } from '@/components/AuthLayout';
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
      <AuthLayout title={t('joinCompany.title')} subtitle={t('joinCompany.subtitle')}>
        <View className="rounded-xl border border-border bg-background p-4">
          <Text className="text-xs uppercase tracking-wide text-text-secondary">{t('joinCompany.foundTitle')}</Text>
          <Text className="mt-1 text-lg font-bold text-text-primary">{company.name}</Text>
          <Text className="text-sm text-text-secondary">Code {company.uniqueCode}</Text>
        </View>
        <Text className="text-sm text-text-secondary">{t('joinCompany.foundNote')}</Text>
        <Button title={t('joinCompany.continueToLogin')} onPress={() => router.replace('/login')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('joinCompany.title')} subtitle={t('joinCompany.subtitle')}>
      <TextField
        label={t('joinCompany.inviteCode')}
        placeholder="PHRM-XXXXX"
        autoCapitalize="characters"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button title={loading ? t('joinCompany.submitting') : t('joinCompany.submit')} onPress={onSubmit} loading={loading} disabled={!code.trim()} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/')} />
    </AuthLayout>
  );
}
