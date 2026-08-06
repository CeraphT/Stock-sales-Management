import { useEffect } from 'react';

import { devicesApi } from '@/lib/api/endpoints/devices';
import { useAuthStore } from '@/lib/auth/store';

const APP_VERSION = 'mobile-0.1.0';
const INTERVAL_MS = 120_000; // 2 min

/** Pings the server so the fleet monitoring view sees this device as "live"
 * even while the app is idle. Ordinary API/sync traffic already refreshes
 * presence server-side; this covers the idle gap. No-op until authenticated. */
export function useHeartbeat() {
  const token = useAuthStore((s) => s.token);
  const deviceId = useAuthStore((s) => s.deviceId);

  useEffect(() => {
    if (!token || !deviceId) return;
    const ping = () => {
      void devicesApi.heartbeat(deviceId, APP_VERSION).catch(() => {});
    };
    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, deviceId]);
}
