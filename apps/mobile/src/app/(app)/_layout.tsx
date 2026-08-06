import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { RegisterGate } from '@/components/RegisterGate';
import { UserRole } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';
import { localShiftService } from '@/lib/local/shiftService';
import { useAutoBackup } from '@/lib/useAutoBackup';
import { useHeartbeat } from '@/lib/useHeartbeat';

// Crash fallback for the authenticated app. It must live in a NESTED layout
// (inside the root navigator), not the root _layout: Expo Router wraps an
// ErrorBoundary in a <Try> that reads navigation context, which doesn't exist
// above the root navigator — putting it at the root threw "Couldn't find a
// navigation context" on every re-render (e.g. toggling the theme).
export { ErrorBoundary } from '@/components/ErrorFallback';

export default function AppLayout() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const isCashier = useAuthStore((s) => s.user?.role) === UserRole.Cashier;
  // Daily local safety backup (offline-resilient); no-op until a company is set.
  useAutoBackup();
  // Keep this device visible as "live" in the fleet monitoring view.
  useHeartbeat();

  // Cashier start-of-day freeze: 'checking' shows nothing (never flashes the app
  // to a cashier), then resolves to 'gated' (RegisterGate is the only thing
  // rendered) when there's no open shift, or 'clear' otherwise. Non-cashiers
  // always resolve to 'clear'. Re-runs on login (token/location change).
  const [gate, setGate] = useState<'checking' | 'gated' | 'clear'>('checking');
  useEffect(() => {
    if (!token || !isCashier || !companyId || !locationId) {
      setGate('clear');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const shift = await localShiftService.getCurrentShift(companyId, locationId);
        if (!cancelled) setGate(shift ? 'clear' : 'gated');
      } catch {
        if (!cancelled) setGate('gated'); // fail closed
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isCashier, companyId, locationId]);

  if (!hasHydrated) {
    return null;
  }
  if (!token) {
    return <Redirect href="/" />;
  }
  if (gate === 'checking') {
    return null;
  }
  if (gate === 'gated') {
    return <RegisterGate onOpened={() => setGate('clear')} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
