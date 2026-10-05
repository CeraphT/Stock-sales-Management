import { eq } from "drizzle-orm";

import { NetworkError } from "../api/client";
import { purchaseOrdersApi } from "../api/endpoints/purchaseOrders";
import { servicesApi } from "../api/endpoints/services";
import { db } from "../db/client";
import { remoteCache } from "../db/schema";

/**
 * Offline B — server-only reads (reports, purchase orders, services,
 * reconciliation…) are computed by the server over every device's data, so
 * they can't be rebuilt from the local mirror. Instead the LAST successful
 * answer is kept per endpoint + params and shown offline, labelled with its
 * date.
 *
 *   const data = await cachedFetch(companyId, `deadStock:${days}`, () => reportsApi.deadStock(...), setStaleAt);
 *
 * Online → fetcher's answer (saved; onStale(null)). On a NetworkError → the
 * cached answer if any (onStale(savedAt)); otherwise the NetworkError is
 * rethrown. Any other error is rethrown untouched.
 */
export async function cachedFetch<T>(
  companyId: string,
  key: string,
  fetcher: () => Promise<T>,
  onStale?: (savedAt: string | null) => void,
): Promise<T> {
  const fullKey = `${companyId}:${key}`;
  try {
    const fresh = await fetcher();
    onStale?.(null);
    // Best effort — a cache write failure must never break the screen.
    const row = { key: fullKey, companyId, json: JSON.stringify(fresh), savedAt: new Date().toISOString() };
    db.insert(remoteCache)
      .values(row)
      .onConflictDoUpdate({ target: remoteCache.key, set: { json: row.json, savedAt: row.savedAt } })
      .catch(() => {});
    return fresh;
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    const cached = await db.query.remoteCache.findFirst({ where: eq(remoteCache.key, fullKey) }).catch(() => undefined);
    if (!cached) throw err;
    onStale?.(cached.savedAt);
    return JSON.parse(cached.json) as T;
  }
}

/** Pre-load the server-only lists people open on the floor (purchase orders,
 * services) right after a successful sync, so they're available offline even
 * if never opened online. Best effort; never throws. Keys must match the
 * screens' cachedFetch keys. */
export async function warmRemoteCache(companyId: string): Promise<void> {
  await Promise.allSettled([
    cachedFetch(companyId, "purchaseOrders:list", () => purchaseOrdersApi.list(companyId)),
    cachedFetch(companyId, "services:list", () => servicesApi.list(companyId)),
  ]);
}
