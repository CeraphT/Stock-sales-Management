import { clearLocalData, isolateCompany } from '@stockflow/core/db/isolation';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

// Every local table — the on-device mirror of the company's data plus any
// not-yet-synced sales. The full backup surface.
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

/** Filesystem-safe timestamp: 2026-08-05-10-22-31. */
function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Build one backup JSON string from the current local data — shared by the
 * manual share and the scheduled auto-backup. Cross-business safety: the
 * tenant-isolation guard runs first, so the file can only contain the
 * signed-in company's data. Purely a read. */
export async function buildBackup(companyId: string): Promise<{ json: string; rowCount: number }> {
  if (!companyId) throw new Error('A signed-in company is required to back up data.');
  await isolateCompany(companyId);

  const tables: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const [name, table] of Object.entries(TABLES)) {
    const rows = await db.select().from(table);
    tables[name] = rows;
    rowCount += rows.length;
  }
  const json = JSON.stringify({ app: 'PharmaStock', kind: 'local-backup', version: 1, companyId, exportedAt: new Date().toISOString(), tables }, null, 2);
  return { json, rowCount };
}

/** Manual "Back up now": write the snapshot to a file and open the share sheet
 * (save to Files, send to Drive/WhatsApp, etc.). */
export async function shareBackup(companyId: string): Promise<{ fileName: string; rowCount: number }> {
  const { json, rowCount } = await buildBackup(companyId);
  const fileName = `pharmastock-backup-${stamp()}.json`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'PharmaStock backup' });
  }
  return { fileName, rowCount };
}

/** Wipe the entire on-device data mirror (including not-yet-synced sales). The
 * server is untouched — a fresh sync after the next login rebuilds the mirror. */
export async function resetAllData(): Promise<void> {
  await clearLocalData();
}
