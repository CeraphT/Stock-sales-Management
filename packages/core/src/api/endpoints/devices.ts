import { api } from "../client";

/** Client-facing device APIs. The heartbeat is a lightweight keep-alive an
 * open app pings periodically so the fleet monitoring view's "live now" stays
 * accurate even while the app is idle (ordinary traffic already refreshes
 * presence server-side via the device-presence middleware). */
export const devicesApi = {
  heartbeat: (deviceId: string, appVersion?: string) =>
    api.post<void>("/api/devices/heartbeat", { deviceId, appVersion }),
};
