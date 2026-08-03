import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreenLayout } from '@/components/AuthScreenLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints/auth';
import { locationsApi } from '@/lib/api/endpoints/locations';
import { useAuthStore } from '@/lib/auth/store';
import { deviceName, devicePlatform } from '@/lib/device';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const deviceId = useAuthStore((s) => s.deviceId);
  const setSession = useAuthStore((s) => s.setSession);
  const setLocation = useAuthStore((s) => s.setLocation);

  const onSubmit = async () => {
    if (!phone.trim() || !password.trim()) {
      showAlert(t('login.title'), t('login.missingFields'));
      return;
    }
    setLoading(true);
    try {
      const auth = await authApi.login({
        phone: phone.trim(),
        password,
        deviceId,
        deviceName,
        platform: devicePlatform,
      });
      setSession({
        token: auth.token,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
        user: auth.user,
        companyId: auth.companyId,
      });
      // SuperAdmin users have no companyId and thus no location to resolve.
      if (auth.companyId) {
        const locations = await locationsApi.list(auth.companyId);
        const mainLocation = locations[0];
        if (mainLocation) {
          setLocation({ locationId: mainLocation.id, locationName: mainLocation.name });
        }
      }
      router.replace('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError && err.status === 401 ? t('login.failed') : err instanceof Error ? err.message : 'Something went wrong.';
      showAlert('Login failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout icon="person-outline" title={t('login.title')} subtitle={t('login.subtitle')}>
      <TextField
        label={t('login.phone')}
        placeholder="e.g. 677001122"
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={phone}
        onChangeText={setPhone}
        returnKeyType="next"
      />
      <TextField
        label={t('login.password')}
        placeholder="Your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button title={loading ? t('login.loggingIn') : t('login.submit')} onPress={onSubmit} loading={loading} />
    </AuthScreenLayout>
  );
}
