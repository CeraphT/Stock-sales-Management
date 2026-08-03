import { Pressable, Text, View } from 'react-native';

import type { Language } from '@/lib/i18n/store';
import { useLanguageStore } from '@/lib/i18n/store';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
];

/** Small EN/FR pill switcher for pre-auth screens (the drawer has its own
 * copy for post-login screens, in the Settings block). */
export function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <View className={`flex-row gap-1 rounded-full p-1 ${dark ? 'bg-white/15' : 'border border-border bg-surface'}`}>
      {LANGUAGES.map((lang) => {
        const active = language === lang.value;
        return (
          <Pressable
            key={lang.value}
            onPress={() => setLanguage(lang.value)}
            className={`rounded-full px-3 py-1 ${active ? (dark ? 'bg-white' : 'bg-primary') : ''}`}>
            <Text
              className={`text-xs font-bold ${active ? (dark ? 'text-primary' : 'text-white') : dark ? 'text-white/90' : 'text-text-primary'}`}>
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
