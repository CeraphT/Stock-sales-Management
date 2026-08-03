import { eq } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";

import { useAuthStore } from "@/lib/auth/store";
import { db } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";

export interface CompanyInfo {
  name: string;
  currency: string;
}

/** Reactive company name + currency from the local sync-pulled mirror —
 * used anywhere a receipt or display needs both together. */
export function useCompanyInfo(): CompanyInfo {
  const companyId = useAuthStore((s) => s.companyId);
  const { data } = useLiveQuery(db.select().from(companies).where(eq(companies.id, companyId ?? "")));
  const company = data?.[0];
  return { name: company?.name ?? "StockFlow", currency: company?.currency ?? "XAF" };
}
