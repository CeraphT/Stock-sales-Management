import { Directory, File, Paths } from 'expo-file-system';

import { buildBackup } from '@/lib/dataBackup';

/**
 * Automatic local daily backup — offline safety for a device that may run for
 * months with no internet. Once per "backup day" (boundary 02:00 local) a full
 * JSON snapshot is written to a persistent `backups/` folder, keeping the last
 * N days. Purely local — never talks to the server. Catch-up scheduled (see
 * runDueBackup): a phone is usually off at 2 AM, so we back up at first launch
 * after the boundary instead, capturing yesterday's finished work.
 */

const DIR = 'backups';
const BOUNDARY_HOUR = 2;
const KEEP_DAYS = 14;
const FILE_RE = /^pharmastock-auto-\d{4}-\d{2}-\d{2}\.json$/;

/** The backup-day a moment belongs to, as a local YYYY-MM-DD string. Days roll
 * over at 02:00, so 00:00–01:59 counts as the previous day. Exported for tests. */
export function backupPeriodKey(now: Date): string {
  const d = new Date(now.getTime());
  if (d.getHours() < BOUNDARY_HOUR) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function backupsDir(): Directory {
  return new Directory(Paths.document, DIR);
}

/** Absolute path of the backups folder (to show the user). */
export function backupsDirPath(): string {
  return backupsDir().uri;
}

function autoFiles(dir: Directory): File[] {
  return dir
    .list()
    .filter((e): e is File => e instanceof File && FILE_RE.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The most recent auto-backup's period, or null — derived from the filenames,
 * so no separate bookkeeping store is needed. */
export function lastBackupInfo(): { period: string; at: string } | null {
  const dir = backupsDir();
  if (!dir.exists) return null;
  const files = autoFiles(dir);
  if (files.length === 0) return null;
  const newest = files[files.length - 1];
  const period = newest.name.slice('pharmastock-auto-'.length, -'.json'.length);
  return { period, at: period };
}

export interface DueBackupResult {
  ran: boolean;
  fileName?: string;
  rows?: number;
  period?: string;
}

/** Run a daily backup if one is due for the current period (or `force`d). */
export async function runDueBackup(companyId: string, opts?: { force?: boolean; now?: Date }): Promise<DueBackupResult> {
  if (!companyId) return { ran: false };
  const now = opts?.now ?? new Date();
  const period = backupPeriodKey(now);
  if (!opts?.force && lastBackupInfo()?.period === period) return { ran: false };

  const { json, rowCount } = await buildBackup(companyId);
  const dir = backupsDir();
  if (!dir.exists) dir.create();
  const fileName = `pharmastock-auto-${period}.json`;
  const file = new File(dir, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  // Rotate: keep only the newest KEEP_DAYS files.
  const files = autoFiles(dir);
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) {
    try {
      f.delete();
    } catch {
      /* ignore */
    }
  }
  return { ran: true, fileName, rows: rowCount, period };
}
