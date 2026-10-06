import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints/auth';
import { UserRole } from '@/lib/api/enums';
import type { AuthResponse } from '@/lib/api/types/auth';
import { storeSession } from '@/lib/auth/session';
import { useAuthStore } from '@/lib/auth/store';
import { deviceName, devicePlatform } from '@/lib/device';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';
import { membershipsApi } from '@stockflow/core/api/endpoints/memberships';

type Mode = 'login' | 'register';

/** Simplified sign-in: phone + password, or create an account. Either way the
 * person lands on "My shops" (SuperAdmins on the company picker). */
export default function LoginScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const deviceId = useAuthStore((s) => s.deviceId);
  // Same phone + password opens a SuperAdmin account AND a shop account: ask where to go.
  const [choice, setChoice] = useState<AuthResponse | null>(null);

  const canSubmit = phone.trim().length >= 6 && (mode === 'login' ? password.length > 0 : password.length >= 6 && !!name.trim());

  const onSubmit = async () => {
    if (!canSubmit) {
      showAlert(mode === 'login' ? t('login.title') : t('auth.createTitle'), mode === 'login' ? t('login.missingFields') : t('auth.missing'));
      return;
    }
    setLoading(true);
    try {
      const device = { deviceId, deviceName, platform: devicePlatform };
      const auth =
        mode === 'login'
          ? await authApi.login({ phone: phone.trim(), password, accountOnly: true, ...device })
          : await membershipsApi.register({ name: name.trim(), phone: phone.trim(), password, ...device });
      if (auth.user.role === UserRole.SuperAdmin && auth.hasShopAccount) {
        setChoice(auth);
        return;
      }
      storeSession(auth);
      router.replace(auth.user.role === UserRole.SuperAdmin ? ('/company-picker' as never) : ('/shops' as never));
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401 ? t('login.failed') : err instanceof ApiError ? err.message : t('auth.network');
      showAlert(mode === 'login' ? t('login.title') : t('auth.createTitle'), message);
    } finally {
      setLoading(false);
    }
  };

  const goShops = async () => {
    setLoading(true);
    try {
      const auth = await authApi.login({
        phone: phone.trim(),
        password,
        accountOnly: true,
        preferShopAccount: true,
        deviceId,
        deviceName,
        platform: devicePlatform,
      });
      storeSession(auth);
      router.replace('/shops' as never);
    } catch (err) {
      showAlert(t('login.title'), err instanceof ApiError ? err.message : t('auth.network'));
    } finally {
      setLoading(false);
    }
  };

  if (choice) {
    return (
      <AuthLayout title={`${t('shops.hello')}, ${choice.user.name.split(' ')[0]} 👋`} subtitle={t('auth.chooseTitle')}>
        <ChoiceCard icon="🏪" title={t('shops.mine')} desc={t('auth.chooseShopsSub')} primary disabled={loading} onPress={() => void goShops()} />
        <ChoiceCard
          icon="🛡️"
          title={t('auth.chooseConsole')}
          desc={t('auth.chooseConsoleSub')}
          disabled={loading}
          onPress={() => {
            storeSession(choice);
            router.replace('/company-picker' as never);
          }}
        />
        <Button title={t('common.back')} variant="ghost" onPress={() => setChoice(null)} disabled={loading} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={mode === 'login' ? t('auth.welcomeBack') : t('auth.createTitle')}
      subtitle={mode === 'login' ? t('login.subtitle') : t('auth.createSub')}>
      <View className="flex-row rounded-full border border-border bg-background p-1">
        {(['login', 'register'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            className={`flex-1 items-center rounded-full py-2.5 ${mode === m ? 'bg-primary' : ''}`}>
            <Text className={`text-sm font-semibold ${mode === m ? 'text-white' : 'text-text-secondary'}`}>
              {m === 'login' ? t('auth.tabLogin') : t('auth.tabCreate')}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'register' ? <TextField label={t('auth.name')} value={name} onChangeText={setName} autoComplete="name" returnKeyType="next" /> : null}
      <TextField
        label={t('login.phone')}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
        returnKeyType="next"
      />
      <TextField
        label={t('login.password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder={mode === 'register' ? t('auth.passwordHint') : undefined}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <Button
        title={mode === 'login' ? (loading ? t('login.loggingIn') : t('login.submit')) : t('auth.createSubmit')}
        onPress={onSubmit}
        loading={loading}
        disabled={!canSubmit}
      />
    </AuthLayout>
  );
}

function ChoiceCard({ icon, title, desc, primary, disabled, onPress }: { icon: string; title: string; desc: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-xl border p-4 active:opacity-80 ${primary ? 'border-primary bg-primary/10' : 'border-border'} ${disabled ? 'opacity-60' : ''}`}>
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text-primary">{title}</Text>
        <Text className="text-xs text-text-secondary">{desc}</Text>
      </View>
    </Pressable>
  );
}
