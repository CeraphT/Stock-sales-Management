import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/lib/auth/store';

// Crash fallback for the authenticated app. It must live in a NESTED layout
// (inside the root navigator), not the root _layout: Expo Router wraps an
// ErrorBoundary in a <Try> that reads navigation context, which doesn't exist
// above the root navigator — putting it at the root threw "Couldn't find a
// navigation context" on every re-render (e.g. toggling the theme).
export { ErrorBoundary } from '@/components/ErrorFallback';

export default function AppLayout() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);

  if (!hasHydrated) {
    return null;
  }
  if (!token) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
