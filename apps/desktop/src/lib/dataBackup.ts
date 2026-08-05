import { db } from "@stockflow/core/db/client";
import { clearLocalData, isolateCompany } from "@stockflow/core/db/isolation";
import * as schema from "@stockflow/core/db/schema";

/** Tauri exposes this global inside the native webview; absent in a plain browser. */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Every local table, in a stable order. This is the on-device mirror of the
 * company's data (plus any not-yet-synced sales) — the full backup surface. */
const TABLES = {
  companies: schema.companies,
  locations: schema.locations,
  users: schema.users,
  categories: schema.categories,
  suppliers: schema.suppliers,
  products: schema.products,
  productPackagingLevels: schema.productPackagingLevels,
  batches: schema.batches,
  stockMovements: schema.stockMovements,
  customers: schema.customers,
  loyaltyAccounts: schema.loyaltyAccounts,
  giftCards: schema.giftCards,
  cashRegisterShifts: schema.cashRegisterShifts,
  sales: schema.sales,
  saleLines: schema.saleLines,
  paymentSplits: schema.paymentSplits,
  syncState: schema.syncState,
} as const;

export interface BackupResult {
  fileName: string;
  rowCount: number;
  /** "Downloads" when saved to disk natively; null when the browser downloaded it. */
  savedTo: string | null;
}

/** A filesystem-safe timestamp: 2026-08-05-10-22-31. */
function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Read every local table and write one JSON snapshot. Native builds save it to
 * the Downloads folder (existing fs capability, no dialog needed); the browser
 * triggers a normal download. Purely a read — never mutates data it keeps.
 *
 * Cross-business safety: `companyId` is REQUIRED. Before reading anything we run
 * the tenant-isolation guard, which wipes the mirror if it holds a DIFFERENT
 * company's rows — so an admin can only ever back up their own company's data,
 * never another business's leftovers on a shared device. */
export async function exportAllData(companyId: string): Promise<BackupResult> {
  if (!companyId) throw new Error("A signed-in company is required to back up data.");
  await isolateCompany(companyId);

  const tables: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const [name, table] of Object.entries(TABLES)) {
    const rows = await db.select().from(table);
    tables[name] = rows;
    rowCount += rows.length;
  }

  const json = JSON.stringify(
    { app: "PharmaStock", kind: "local-backup", version: 1, companyId, exportedAt: new Date().toISOString(), tables },
    null,
    2,
  );
  const fileName = `pharmastock-backup-${stamp()}.json`;

  if (isTauri()) {
    const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(fileName, json, { baseDir: BaseDirectory.Download });
    return { fileName, rowCount, savedTo: "Downloads" };
  }

  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { fileName, rowCount, savedTo: null };
}

/** Wipe the entire on-device data mirror (including any not-yet-synced sales).
 * Server data is untouched — a fresh sync after the next login rebuilds the
 * mirror. Device settings (printer, theme, language) live in localStorage and
 * are left alone. */
export async function resetAllData(): Promise<void> {
  await clearLocalData();
}
