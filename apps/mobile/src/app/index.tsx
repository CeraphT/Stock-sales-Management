import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="flex-1 bg-background">
      <ScreenBackground />
      <SafeAreaView className="flex-1">
        <View className="flex-row justify-end px-5 pt-2">
          <LanguageToggle />
        </View>

        <View className="flex-1 items-center justify-center px-8 pb-10">
          <View
            style={{ width: 64, height: 64 }}
            className="items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md shadow-black/10">
            <Image
              source={require('../../assets/images/android-icon-foreground.png')}
              style={{ width: 44, height: 44 }}
              resizeMode="contain"
            />
          </View>

          <Text className="mt-5 text-center text-sm text-text-secondary">{t('onboarding.tagline')}</Text>
        </View>

        <View className="gap-3 rounded-t-[32px] bg-surface px-6 pb-8 pt-8 shadow-lg shadow-black/10">
          <OnboardingAction
            href="/create-company"
            icon="business-outline"
            iconBg="bg-accent-blue-soft"
            iconColor={colors.accentBlue}
            chevronColor={colors.iconMuted}
            title={t('onboarding.createCompany')}
            subtitle={t('onboarding.createCompanySub')}
          />
          <OnboardingAction
            href="/join-company"
            icon="people-outline"
            iconBg="bg-accent-purple-soft"
            iconColor={colors.accentPurple}
            chevronColor={colors.iconMuted}
            title={t('onboarding.joinCompany')}
            subtitle={t('onboarding.joinCompanySub')}
          />
          <OnboardingAction
            href="/login"
            icon="log-in-outline"
            iconBg="bg-success/15"
            iconColor={colors.success}
            chevronColor={colors.iconMuted}
            title={t('onboarding.login')}
            subtitle={t('onboarding.loginSub')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

function OnboardingAction({
  href,
  icon,
  iconBg,
  iconColor,
  chevronColor,
  title,
  subtitle,
}: {
  href: '/create-company' | '/join-company' | '/login';
  icon: IconName;
  iconBg: string;
  iconColor: string;
  chevronColor: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} asChild>
      <View className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 shadow-sm shadow-black/5 active:opacity-80">
        <View className={`h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary">{title}</Text>
          <Text className="text-xs text-text-secondary">{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={chevronColor} />
      </View>
    </Link>
  );
}
