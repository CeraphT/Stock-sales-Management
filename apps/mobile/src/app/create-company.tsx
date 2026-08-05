import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { useAuthStore } from '@/lib/auth/store';
import { deviceName, devicePlatform } from '@/lib/device';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function CreateCompanyScreen() {
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const deviceId = useAuthStore((s) => s.deviceId);
  const setSession = useAuthStore((s) => s.setSession);
  const setLocation = useAuthStore((s) => s.setLocation);

  const onSubmit = async () => {
    if (!businessName.trim() || !adminName.trim() || !adminPhone.trim() || !adminPassword.trim()) {
      showAlert(t('createCompany.title'), t('createCompany.missingFields'));
      return;
    }
    setLoading(true);
    try {
      const result = await companiesApi.create({
        name: businessName.trim(),
        description: null,
        currency: currency.trim() || 'XAF',
        adminName: adminName.trim(),
        adminPhone: adminPhone.trim(),
        adminPassword,
        deviceId,
        deviceName,
        platform: devicePlatform,
      });
      setSession({
        token: result.admin.token,
        refreshToken: result.admin.refreshToken,
        expiresAt: result.admin.expiresAt,
        user: result.admin.user,
        companyId: result.admin.companyId,
      });
      setLocation({ locationId: result.defaultLocation.id, locationName: result.defaultLocation.name });
      router.replace('/dashboard');
    } catch (err) {
      showAlert('Could not create business', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const ready = !!businessName.trim() && !!adminName.trim() && !!adminPhone.trim() && adminPassword.length >= 6;

  return (
    <AuthLayout title={t('createCompany.title')} subtitle={t('createCompany.subtitle')}>
      <TextField label={t('createCompany.businessName')} value={businessName} onChangeText={setBusinessName} returnKeyType="next" />
      <TextField label={t('createCompany.currency')} autoCapitalize="characters" value={currency} onChangeText={setCurrency} returnKeyType="next" />

      <View className="my-1 border-t border-border" />

      <TextField label={t('createCompany.yourName')} value={adminName} onChangeText={setAdminName} returnKeyType="next" />
      <TextField
        label={t('createCompany.yourPhone')}
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={adminPhone}
        onChangeText={setAdminPhone}
        returnKeyType="next"
      />
      <TextField
        label={t('createCompany.password')}
        secureTextEntry
        value={adminPassword}
        onChangeText={setAdminPassword}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button title={loading ? t('createCompany.submitting') : t('createCompany.submit')} onPress={onSubmit} loading={loading} disabled={!ready} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/')} />
    </AuthLayout>
  );
}
