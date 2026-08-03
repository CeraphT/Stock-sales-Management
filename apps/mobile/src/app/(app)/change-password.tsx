import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints/auth';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      showAlert(t('changePassword.title'), t('changePassword.missingFields'));
      return;
    }
    if (newPassword.length < 6) {
      showAlert(t('changePassword.title'), t('changePassword.tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('changePassword.title'), t('changePassword.mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showAlert(t('changePassword.title'), t('changePassword.success'), [{ text: t('common.done'), onPress: () => router.back() }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong.';
      showAlert(t('changePassword.title'), message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-sm font-semibold text-primary">← {t('common.back')}</Text>
          </Pressable>
          <Text className="text-lg font-bold text-text-primary">{t('changePassword.title')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <TextField label={t('changePassword.current')} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
        <TextField label={t('changePassword.new')} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
        <TextField label={t('changePassword.confirm')} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />

        <Button title={submitting ? t('changePassword.submitting') : t('changePassword.submit')} loading={submitting} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}
