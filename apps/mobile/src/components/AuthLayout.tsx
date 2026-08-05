import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/LanguageToggle';
import { ScreenBackground } from '@/components/ScreenBackground';

/**
 * Shared shell for the pre-login screens (login / create-company / join-company),
 * mirroring the desktop AuthLayout (apps/desktop/src/components/AuthLayout.tsx):
 * brand mark (◆ StockFlow · Business management) over a card with title/subtitle,
 * plus the FR/EN toggle. Flex/centering use inline `style` rather than className —
 * `flex-1`/contentContainerClassName silently failed to center on-device on this
 * ScrollView chain (see the old AuthScreenLayout note); inline style avoids it.
 */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1 }} className="bg-background">
      <ScreenBackground />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }} className="px-5 pt-2">
          <LanguageToggle />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}
            keyboardShouldPersistTaps="handled">
            <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
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
                <Text className="text-xl font-bold text-text-primary">{title}</Text>
                {subtitle ? <Text className="mt-1 text-sm text-text-secondary">{subtitle}</Text> : null}
                <View className="mt-5 gap-4">{children}</View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
