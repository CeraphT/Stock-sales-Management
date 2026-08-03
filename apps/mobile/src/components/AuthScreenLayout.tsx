import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from './LanguageToggle';
import { ScreenBackground } from './ScreenBackground';

type IconName = keyof typeof Ionicons.glyphMap;

interface AuthScreenLayoutProps {
  icon: IconName;
  title: string;
  subtitle: string;
  children: ReactNode;
  showBack?: boolean;
}

/** Shared chrome for every pre-auth screen (onboarding's action cards
 * aside) — a brand-green hero (back button, language toggle, icon badge,
 * title/subtitle) over a rounded white sheet whose content is centered,
 * so login/create-company/join-company all read as one consistent flow.
 *
 * All flex/layout sizing here is done via inline `style` rather than
 * NativeWind className — `flex-1`/`contentContainerClassName` on this
 * exact ScrollView chain silently failed to apply on-device (content sat
 * pinned to the top instead of centering), while color/radius/typography
 * classNames rendered fine. Inline style sidesteps that class of bug. */
export function AuthScreenLayout({ icon, title, subtitle, children, showBack = true }: AuthScreenLayoutProps) {
  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} className="px-5 pt-2">
          {showBack ? (
            <Pressable onPress={() => router.back()} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View className="h-9 w-9" />
          )}
          <LanguageToggle dark />
        </View>

        <View style={{ alignItems: 'center' }} className="px-8 pb-6 pt-4">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
            <Ionicons name={icon} size={30} color="#FFFFFF" />
          </View>
          <Text className="mt-4 text-2xl font-bold text-white">{title}</Text>
          <Text className="mt-1 text-center text-sm text-white/80">{subtitle}</Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: 'hidden' }} className="rounded-t-[32px] bg-background">
            <ScreenBackground />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
              keyboardShouldPersistTaps="handled">
              <View style={{ width: '100%', maxWidth: 384, gap: 16 }}>{children}</View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
