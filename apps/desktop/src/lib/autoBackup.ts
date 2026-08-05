import { buildBackup } from "@/lib/dataBackup";

/**
 * Automatic local daily backup — offline-safety for a device that may run for
 * months with no internet. Once per "backup day" (the day boundary is 02:00
 * local) a full snapshot of the local data is written to a dedicated folder,
 * and the last N days are kept. This is purely LOCAL — it never talks to the
 * server. See the design notes on `runDueBackup` for why it's a catch-up
 * schedule rather than a literal 2 AM alarm.
 */

const BACKUP_DIR = "backups";
const BOUNDARY_HOUR = 2; // a new "backup day" starts at 02:00 local time
const KEEP_DAYS = 14; // rolling retention — never a single overwrite
const STATE_KEY = "pharmastock-autobackup";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface AutoBackupState {
  /** Backup-day key (YYYY-MM-DD) of the last successful auto-backup. */
  period: string;
  /** ISO timestamp of the last successful auto-backup. */
  at: string;
  /** How many rows that snapshot held. */
  rows: number;
}

export function readAutoBackupState(): AutoBackupState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as AutoBackupState) : null;
  } catch {
    return null;
  }
}

function writeAutoBackupState(s: AutoBackupState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/**
 * The "backup day" a moment belongs to, as a local YYYY-MM-DD string. Days roll
 * over at 02:00, so anything from 00:00–01:59 still counts as the previous day.
 * Exported for testing. Uses LOCAL date parts throughout (no UTC mixing).
 */
export function backupPeriodKey(now: Date): string {
  const d = new Date(now.getTime());
  if (d.getHours() < BOUNDARY_HOUR) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True if no auto-backup has been taken yet for the current backup day. */
export function isBackupDue(now: Date, state: AutoBackupState | null): boolean {
  return state?.period !== backupPeriodKey(now);
}

/** Absolute path of the backups folder (for showing the user). Native only. */
export async function backupsDirPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    return await join(await appDataDir(), BACKUP_DIR);
  } catch {
    return null;
  }
}

/** Keep only the newest KEEP_DAYS auto-backup files; delete the rest. */
async function rotate(): Promise<void> {
  const { readDir, remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(BACKUP_DIR, { baseDir: BaseDirectory.AppData });
  const files = entries
    .filter((e) => e.isFile && /^pharmastock-auto-\d{4}-\d{2}-\d{2}\.json$/.test(e.name))
    .map((e) => e.name)
    .sort() // filenames sort chronologically (date in name)
    .reverse();
  for (const name of files.slice(KEEP_DAYS)) {
    await remove(`${BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData }).catch(() => {});
  }
}

export interface DueBackupResult {
  ran: boolean;
  fileName?: string;
  rows?: number;
  period?: string;
}

/**
 * Run a daily backup if one is due (or `force`d).
 *
 * Why catch-up, not a literal 2 AM alarm: a shop PC is usually OFF at 2 AM, so
 * a real alarm would silently never fire. Instead we check on app launch and on
 * an interval — if the current backup day has no snapshot yet, we take one
 * immediately. So it fires ~2 AM if the app happens to be running then, and
 * otherwise at first launch the next morning — capturing yesterday's completed
 * work BEFORE today's activity can change anything. Only the installed app can
 * write to disk; in a plain browser this is a no-op.
 */
export async function runDueBackup(companyId: string, opts?: { force?: boolean; now?: Date }): Promise<DueBackupResult> {
  if (!isTauri() || !companyId) return { ran: false };
  const now = opts?.now ?? new Date();
  const state = readAutoBackupState();
  if (!opts?.force && !isBackupDue(now, state)) return { ran: false };

  const period = backupPeriodKey(now);
  const { json, rowCount } = await buildBackup(companyId);
  const fileName = `pharmastock-auto-${period}.json`;

  const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
  await writeTextFile(`${BACKUP_DIR}/${fileName}`, json, { baseDir: BaseDirectory.AppData });
  await rotate().catch(() => {});

  writeAutoBackupState({ period, at: now.toISOString(), rows: rowCount });
  return { ran: true, fileName, rows: rowCount, period };
}
