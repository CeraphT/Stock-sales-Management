import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/LanguageToggle';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Matches the desktop onboarding (apps/desktop/src/screens/auth/Onboarding.tsx +
// AuthLayout): brand mark, a "Welcome" card, Log in as the highlighted primary
// action, Create a company, and a subtle invite-code lookup — same routes/flow.
export default function OnboardingScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-background">
      <ScreenBackground />
      <SafeAreaView className="flex-1">
        <View className="flex-row justify-end px-5 pt-2">
          <LanguageToggle />
        </View>

        <View className="flex-1 justify-center px-6 pb-10">
          <View className="w-full self-center" style={{ maxWidth: 420 }}>
            {/* Brand */}
            <View className="mb-5 flex-row items-center gap-3">
              <View
                className="h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: '#6366F1', shadowColor: '#6366F1', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
                <Text className="text-2xl font-black text-white">◆</Text>
              </View>
              <View>
                <Text className="text-xl font-extrabold tracking-tight text-primary">StockFlow</Text>
                <Text className="text-xs text-text-secondary">Business management</Text>
              </View>
            </View>

            {/* Card */}
            <View
              className="rounded-card border border-border bg-surface p-6"
              style={{ shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}>
              <Text className="text-xl font-bold text-text-primary">{t('onboarding.welcome')}</Text>
              <Text className="mt-1 text-sm text-text-secondary">{t('onboarding.tagline')}</Text>

              <View className="mt-5 gap-2.5">
                <OnboardingAction icon="🔑" title={t('onboarding.login')} desc={t('onboarding.loginSub')} onPress={() => router.push('/login')} primary />
                <OnboardingAction icon="🏢" title={t('onboarding.createCompany')} desc={t('onboarding.createCompanySub')} onPress={() => router.push('/create-company')} />
              </View>

              <Pressable onPress={() => router.push('/join-company')} className="mt-4 active:opacity-70">
                <Text className="text-center text-xs font-semibold text-text-secondary">{t('onboarding.inviteLookup')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function OnboardingAction({ icon, title, desc, onPress, primary }: { icon: string; title: string; desc: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-xl border p-3.5 active:opacity-80 ${primary ? 'border-primary bg-primary/10' : 'border-border'}`}>
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-background">
        <Text className="text-lg">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text-primary">{title}</Text>
        <Text className="text-xs text-text-secondary">{desc}</Text>
      </View>
    </Pressable>
  );
}
