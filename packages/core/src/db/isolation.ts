import { ne } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

// Child → parent order so row deletes never trip a foreign-key constraint.
const TABLES = [
  schema.paymentSplits,
  schema.saleLines,
  schema.sales,
  schema.stockMovements,
  schema.batches,
  schema.productPackagingLevels,
  schema.products,
  schema.giftCards,
  schema.loyaltyAccounts,
  schema.customers,
  schema.cashRegisterShifts,
  schema.suppliers,
  schema.categories,
  schema.users,
  schema.locations,
  schema.companies,
  schema.syncState,
  schema.pendingOps,
  schema.remoteCache,
];

/** Wipe every local table — the offline mirror is a per-company cache, not a
 * multi-tenant store. */
export async function clearLocalData(): Promise<void> {
  for (const table of TABLES) {
    await db.delete(table);
  }
}

/**
 * Tenant isolation for the offline mirror. If the local database already holds
 * data belonging to a DIFFERENT company than the one now signed in, wipe it
 * before syncing — a device must never mix two businesses' data. Call this once
 * per session, before the first sync. Returns true if it wiped.
 *
 * (Reads are already scoped by companyId everywhere, so a wrong company is never
 * *shown*; this additionally guarantees another business's rows aren't even
 * present on disk once you've switched companies.)
 */
export async function isolateCompany(companyId: string): Promise<boolean> {
  const companies = await db.query.companies.findMany();
  if (companies.length > 0 && companies.some((c) => c.id !== companyId)) {
    await clearLocalData();
    return true;
  }
  return false;
}

/** The business whose data the local mirror currently holds (null when empty). */
export async function localCompanyId(): Promise<string | null> {
  const companies = await db.query.companies.findMany();
  return companies[0]?.id ?? null;
}

/** Work done on this device that the server hasn't accepted yet: sales and
 * cash-register shifts still PendingPush, plus queued offline writes. Switching
 * to another business wipes the mirror, so this must be 0 (or the user must
 * agree to lose it) before opening a different business. */
export async function countUnsynced(): Promise<number> {
  const pendingSales = await db.select({ id: schema.sales.id }).from(schema.sales).where(ne(schema.sales.syncStatus, 0));
  const pendingShifts = await db
    .select({ id: schema.cashRegisterShifts.id })
    .from(schema.cashRegisterShifts)
    .where(ne(schema.cashRegisterShifts.syncStatus, 0));
  const ops = await db.select({ id: schema.pendingOps.id }).from(schema.pendingOps);
  return pendingSales.length + pendingShifts.length + ops.length;
}
