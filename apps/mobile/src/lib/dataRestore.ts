import { SyncStatus } from '@stockflow/core/api/enums';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

/** Parsed backup file. `companyId` gates cross-business restore. */
export interface ParsedBackup {
  companyId: string | null;
  exportedAt: string | null;
  tables: Record<string, Record<string, unknown>[]>;
}

// Restorable tables + their primary key. `syncState` is deliberately excluded —
// restoring the sync cursors would corrupt the next sync. `hasCompanyId` marks
// company-scoped tables so we can defensively drop any foreign-company rows.
interface TableMeta {
  name: string;
  // drizzle table + column objects; typed loosely to avoid generic churn.
  table: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  pkCol: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  pkName: string;
  hasCompanyId: boolean;
}

const META: TableMeta[] = [
  { name: 'companies', table: schema.companies, pkCol: schema.companies.id, pkName: 'id', hasCompanyId: false },
  { name: 'locations', table: schema.locations, pkCol: schema.locations.id, pkName: 'id', hasCompanyId: true },
  { name: 'users', table: schema.users, pkCol: schema.users.id, pkName: 'id', hasCompanyId: true },
  { name: 'categories', table: schema.categories, pkCol: schema.categories.id, pkName: 'id', hasCompanyId: true },
  { name: 'suppliers', table: schema.suppliers, pkCol: schema.suppliers.id, pkName: 'id', hasCompanyId: true },
  { name: 'products', table: schema.products, pkCol: schema.products.id, pkName: 'id', hasCompanyId: true },
  { name: 'productPackagingLevels', table: schema.productPackagingLevels, pkCol: schema.productPackagingLevels.id, pkName: 'id', hasCompanyId: false },
  { name: 'batches', table: schema.batches, pkCol: schema.batches.id, pkName: 'id', hasCompanyId: false },
  { name: 'stockMovements', table: schema.stockMovements, pkCol: schema.stockMovements.id, pkName: 'id', hasCompanyId: false },
  { name: 'customers', table: schema.customers, pkCol: schema.customers.id, pkName: 'id', hasCompanyId: true },
  { name: 'loyaltyAccounts', table: schema.loyaltyAccounts, pkCol: schema.loyaltyAccounts.customerId, pkName: 'customerId', hasCompanyId: false },
  { name: 'giftCards', table: schema.giftCards, pkCol: schema.giftCards.id, pkName: 'id', hasCompanyId: true },
  { name: 'cashRegisterShifts', table: schema.cashRegisterShifts, pkCol: schema.cashRegisterShifts.id, pkName: 'id', hasCompanyId: true },
  { name: 'sales', table: schema.sales, pkCol: schema.sales.id, pkName: 'id', hasCompanyId: true },
  { name: 'saleLines', table: schema.saleLines, pkCol: schema.saleLines.id, pkName: 'id', hasCompanyId: false },
  { name: 'paymentSplits', table: schema.paymentSplits, pkCol: schema.paymentSplits.id, pkName: 'id', hasCompanyId: false },
];

/** Validate + parse a backup file's text. Throws if it isn't a PharmaStock backup. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  const d = data as Record<string, unknown>;
  if (!d || d.app !== 'PharmaStock' || d.kind !== 'local-backup' || typeof d.tables !== 'object') {
    throw new Error("This file isn't a PharmaStock backup.");
  }
  return {
    companyId: (d.companyId as string) ?? null,
    exportedAt: (d.exportedAt as string) ?? null,
    tables: d.tables as Record<string, Record<string, unknown>[]>,
  };
}

function rowsFor(parsed: ParsedBackup, m: TableMeta, companyId: string): Record<string, unknown>[] {
  const rows = Array.isArray(parsed.tables[m.name]) ? parsed.tables[m.name] : [];
  return m.hasCompanyId ? rows.filter((r) => r.companyId === companyId) : rows;
}

async function localPkSet(m: TableMeta): Promise<Set<unknown>> {
  const rows = (await db.select().from(m.table)) as Record<string, unknown>[];
  return new Set(rows.map((r) => r[m.pkName]));
}

export interface TableRecap {
  name: string;
  fileRows: number;
  existing: number;
  newRows: number;
}

/** Compare a backup against the current local data. `companyMismatch` = the file
 * belongs to a different business (caller must refuse the restore). */
export async function analyzeBackup(parsed: ParsedBackup, currentCompanyId: string): Promise<{ companyMismatch: boolean; recap: TableRecap[] }> {
  const companyMismatch = !!parsed.companyId && parsed.companyId !== currentCompanyId;
  if (companyMismatch) return { companyMismatch, recap: [] };

  const recap: TableRecap[] = [];
  for (const m of META) {
    const rows = rowsFor(parsed, m, currentCompanyId);
    if (rows.length === 0) continue;
    const localIds = await localPkSet(m);
    let existing = 0;
    for (const r of rows) if (localIds.has(r[m.pkName])) existing++;
    recap.push({ name: m.name, fileRows: rows.length, existing, newRows: rows.length - existing });
  }
  return { companyMismatch, recap };
}

export interface RestoreResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Write selected tables from the backup into the local mirror.
 * - `mode: "add"` — insert only rows whose primary key isn't already present.
 * - `mode: "replace"` — upsert existing matches + insert new.
 * Individual statements (no transaction) — drizzle's db.transaction silently
 * drops writes on the expo-sqlite driver (see CLAUDE.md).
 */
export async function applyRestore(parsed: ParsedBackup, currentCompanyId: string, selected: string[], mode: 'add' | 'replace'): Promise<RestoreResult> {
  const sel = new Set(selected);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of META) {
    if (!sel.has(m.name)) continue;
    const rows = rowsFor(parsed, m, currentCompanyId);
    if (rows.length === 0) continue;
    const localIds = await localPkSet(m);

    for (const row of rows) {
      const exists = localIds.has(row[m.pkName]);
      if (mode === 'add') {
        if (exists) {
          skipped++;
          continue;
        }
        await db.insert(m.table).values(row).onConflictDoNothing();
        inserted++;
      } else {
        await db.insert(m.table).values(row).onConflictDoUpdate({ target: m.pkCol, set: row });
        if (exists) updated++;
        else inserted++;
      }
    }
  }
  return { inserted, updated, skipped };
}

/** How many local sales + shifts are still PendingPush (promotable to the server
 * after a restore). Catalog/customers are server-owned and never pushed. */
export async function countUnsyncedTransactions(companyId: string): Promise<number> {
  const s = (await db.select().from(schema.sales).where(and(eq(schema.sales.companyId, companyId), eq(schema.sales.syncStatus, SyncStatus.PendingPush)))) as unknown[];
  const sh = (await db
    .select()
    .from(schema.cashRegisterShifts)
    .where(and(eq(schema.cashRegisterShifts.companyId, companyId), eq(schema.cashRegisterShifts.syncStatus, SyncStatus.PendingPush)))) as unknown[];
  return s.length + sh.length;
}

/** Human labels for the recap list. */
export const TABLE_LABELS: Record<string, string> = {
  companies: 'Company profile',
  locations: 'Branches',
  users: 'Staff',
  categories: 'Categories',
  suppliers: 'Suppliers',
  products: 'Products',
  productPackagingLevels: 'Product packaging',
  batches: 'Stock batches',
  stockMovements: 'Stock movements',
  customers: 'Customers',
  loyaltyAccounts: 'Loyalty accounts',
  giftCards: 'Gift cards',
  cashRegisterShifts: 'Cash register shifts',
  sales: 'Sales',
  saleLines: 'Sale lines',
  paymentSplits: 'Payments',
};
