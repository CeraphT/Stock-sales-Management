import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreenLayout } from '@/components/AuthScreenLayout';
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
        currency: 'XAF',
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

  return (
    <AuthScreenLayout icon="business-outline" title={t('createCompany.title')} subtitle={t('createCompany.subtitle')}>
      <TextField
        label={t('createCompany.businessName')}
        placeholder="e.g. Central Pharmacy"
        value={businessName}
        onChangeText={setBusinessName}
        returnKeyType="next"
      />
      <TextField
        label={t('createCompany.yourName')}
        placeholder="e.g. Jean Mballa"
        value={adminName}
        onChangeText={setAdminName}
        returnKeyType="next"
      />
      <TextField
        label={t('createCompany.yourPhone')}
        placeholder="e.g. 677001122"
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={adminPhone}
        onChangeText={setAdminPhone}
        returnKeyType="next"
      />
      <TextField
        label={t('createCompany.password')}
        placeholder="Choose a password"
        secureTextEntry
        value={adminPassword}
        onChangeText={setAdminPassword}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button title={loading ? t('createCompany.submitting') : t('createCompany.submit')} onPress={onSubmit} loading={loading} />
    </AuthScreenLayout>
  );
}
