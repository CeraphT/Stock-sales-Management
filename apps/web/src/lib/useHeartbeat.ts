import { devicesApi } from "@stockflow/core/api/endpoints/devices";
import { useEffect } from "react";

import { useAuthStore } from "@/lib/stores";

const APP_VERSION = "web-0.1.0";
const INTERVAL_MS = 120_000; // 2 min

/** Pings the server so the fleet monitoring view sees this session as "live"
 * even while the app is idle. Ordinary API traffic already refreshes presence
 * server-side; this covers the idle gap. No-op until authenticated. */
export function useHeartbeat() {
  const token = useAuthStore((s) => s.token);
  const deviceId = useAuthStore((s) => s.deviceId);

  useEffect(() => {
    if (!token || !deviceId) return;
    const ping = () => {
      void devicesApi.heartbeat(deviceId, APP_VERSION).catch(() => {});
    };
    ping(); // one immediately on mount
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, deviceId]);
}
