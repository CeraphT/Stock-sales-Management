import { useColorScheme } from 'nativewind';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { tr } from '@/lib/i18n/translate';

/** App-wide crash fallback, exported as `ErrorBoundary` from app/_layout.tsx so
 * Expo Router shows a themed recover screen instead of a white screen when any
 * render throws. Mirrors desktop's components/Errors.tsx.
 *
 * It renders OUTSIDE the app's providers (QueryClient/ThemeProvider) and i18n
 * context, so it stays self-contained: NativeWind styling, the colour-scheme hook
 * and `tr()`, which reads the language store directly (no provider needed). */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { colorScheme } = useColorScheme();
  const wrap = colorScheme === 'dark' ? 'dark flex-1' : 'flex-1';
  return (
    <View className={wrap}>
      <View className="flex-1 items-center justify-center bg-background px-6">
        <View className="w-full max-w-md rounded-card border border-border bg-surface p-6">
          <Text className="text-center text-4xl">⚠️</Text>
          <Text className="mt-2 text-center text-lg font-bold text-text-primary">{tr('crash.title')}</Text>
          <Text className="mt-1 text-center text-sm text-text-secondary">{tr('crash.body')}</Text>
          {error?.message ? (
            <Text className="mt-3 rounded-lg bg-background px-3 py-2 text-center text-xs text-text-secondary">{error.message}</Text>
          ) : null}
          <View className="mt-4">
            <Button title={tr('crash.retry')} onPress={() => retry()} />
          </View>
        </View>
      </View>
    </View>
  );
}
