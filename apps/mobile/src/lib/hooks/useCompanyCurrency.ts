import { eq } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";

import { useAuthStore } from "@/lib/auth/store";
import { db } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";

/** Reads the signed-in company's currency code (e.g. "XAF") from the local
 * sync-pulled mirror — reactive, so it updates automatically if it's ever
 * changed from a company-settings screen. Falls back to "XAF" (this
 * project's only real-world currency so far) if nothing has synced yet. */
export function useCompanyCurrency(): string {
  const companyId = useAuthStore((s) => s.companyId);
  const { data } = useLiveQuery(db.select().from(companies).where(eq(companies.id, companyId ?? "")));
  return data?.[0]?.currency ?? "XAF";
}
