import { Redirect, Stack, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { NoCompanyNotice } from '@/components/NoCompanyNotice';
import { RegisterGate } from '@/components/RegisterGate';
import { SyncingBar } from '@/components/SyncingBar';
import { TabletNavRail } from '@/components/TabletNavRail';
import { UserRole } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';
import { isCompanyRoute } from '@/lib/companyGate';
import { localShiftService } from '@/lib/local/shiftService';
import { syncNow } from '@/lib/sync/syncNow';
import { useSyncStatus } from '@/lib/sync/syncStatus';
import { isolateCompany } from '@stockflow/core/db/isolation';
import { localDbWriteLock } from '@stockflow/core/db/writeLock';
import { useAutoBackup } from '@/lib/useAutoBackup';
import { useHeartbeat } from '@/lib/useHeartbeat';
import { useIsTablet } from '@/lib/useIsTablet';

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
  const isTablet = useIsTablet();
  const pathname = usePathname();
  // Daily local safety backup (offline-resilient); no-op until a company is set.
  useAutoBackup();
  // Keep this device visible as "live" in the fleet monitoring view.
  useHeartbeat();

  // Initial sync once per company session (app start, login, entering a
  // company) — mobile previously only synced on manual pull-to-refresh. Tenant
  // isolation first, as on web/desktop (Shell.tsx): if the local mirror still
  // holds another company's rows, wipe them before pulling this one.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!token || !companyId || syncedFor.current === companyId) return;
    syncedFor.current = companyId;
    (async () => {
      useSyncStatus.getState().setInitialSyncing(true);
      try {
        await localDbWriteLock.run(() => isolateCompany(companyId));
      } catch {
        /* non-blocking */
      }
      try {
        await syncNow();
      } catch {
        /* offline — screens use the local mirror; next sync retries */
      } finally {
        useSyncStatus.getState().setInitialSyncing(false);
      }
    })();
  }, [token, companyId]);

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
  // No company yet (SuperAdmin outside any business): a company screen reached
  // anyway (deep link, back stack) is covered by an explanation instead of
  // spinning forever on its early `if (!companyId) return`. The navigation
  // greys these out too (TabletNavRail, tabs, More); this is the safety net.
  const blocked = !companyId && isCompanyRoute(pathname);
  const stack = (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {blocked ? <NoCompanyNotice /> : null}
      <SyncingBar />
    </View>
  );
  // SuperAdmin inside a company (M8): amber banner above everything.
  const banner = <ImpersonationBanner />;
  // Desktop-style shell on tablets: a persistent left nav rail beside the
  // content stack (so it stays visible across tab screens AND pushed detail
  // screens). Phones keep the bottom-tab layout.
  if (isTablet) {
    return (
      <View style={{ flex: 1 }}>
        {banner}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TabletNavRail />
          <View style={{ flex: 1 }}>{stack}</View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {banner}
      {stack}
    </View>
  );
}
