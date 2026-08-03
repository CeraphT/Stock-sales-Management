import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/lib/auth/store';

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
