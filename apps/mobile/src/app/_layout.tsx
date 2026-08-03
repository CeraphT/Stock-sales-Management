import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useColorScheme } from 'nativewind';
import { Text, View } from 'react-native';

import { AppAlertHost } from '@/components/AppAlertHost';
import { db } from '@/lib/db/client';
import migrations from '@/lib/db/migrations/migrations';
import { useLanguageStore } from '@/lib/i18n/store';
import { useThemeStore } from '@/lib/theme/store';

import '../global.css';

const queryClient = new QueryClient();

// Fired at module load — as early as this JS bundle can possibly run,
// before the first React render. NativeWind's colorScheme already tracks
// the OS setting by default with zero setup (confirmed in its source:
// colorScheme.get() falls back to the live system value whenever nothing
// has been explicitly set), so a fresh install with nothing in
// SecureStore yet already renders in the correct system theme from frame
// one. This call's real job is restoring a PREVIOUSLY chosen explicit
// light/dark override across restarts — starting it here instead of in a
// post-mount useEffect shrinks the window where the app would otherwise
// flash back to the system theme before that stored override applies.
useThemeStore.getState().hydrate();
useLanguageStore.getState().hydrate();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const { success, error } = useMigrations(db, migrations);

  // NativeWind's tailwind.config.js darkMode is "class" (required for the
  // CSS-custom-property theme in global.css — see the `.dark { ... }`
  // block), and in "class" mode the `.dark` selector is matched literally,
  // the same as web Tailwind: something has to actually render
  // className="dark". NativeWind does not add this itself even though
  // `colorScheme` correctly tracks the OS setting — confirmed on-device
  // (colorScheme read "dark" while every themed color still rendered
  // light, until this wrapper was added). This root View is that
  // className="dark" toggle, applied once for the whole app.
  const rootClassName = colorScheme === 'dark' ? 'dark flex-1' : 'flex-1';

  if (error) {
    return (
      <View className={`${rootClassName} items-center justify-center bg-background px-6`}>
        <Text className="text-center text-error">Local database setup failed: {error.message}</Text>
      </View>
    );
  }
  if (!success) {
    return <View className={`${rootClassName} bg-background`} />;
  }

  return (
    <View className={rootClassName}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <AppAlertHost />
        </ThemeProvider>
      </QueryClientProvider>
    </View>
  );
}
