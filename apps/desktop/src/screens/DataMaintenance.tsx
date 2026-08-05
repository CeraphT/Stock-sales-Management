import { useEffect, useState } from "react";

import { UserRole } from "@stockflow/core/api/enums";

import { Button } from "@/components/Button";
import { backupsDirPath, readAutoBackupState, runDueBackup } from "@/lib/autoBackup";
import { confirmDialog } from "@/lib/confirm";
import { exportAllData, resetAllData } from "@/lib/dataBackup";
import { analyzeBackup, applyRestore, countUnsyncedTransactions, parseBackup, TABLE_LABELS, type ParsedBackup, type TableRecap } from "@/lib/dataRestore";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { logout } from "@/lib/session";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";
import { useCompany } from "@/lib/useCompany";

type Busy = null | "backup" | "reset" | "restore" | "analyze" | "auto";

export function DataMaintenance() {
  const t = useT();
  const companyId = useAuthStore((s) => s.companyId);
  const role = useAuthStore((s) => s.user?.role);
  const company = useCompany().data;
  const [busy, setBusy] = useState<Busy>(null);

  // Restore state.
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [recap, setRecap] = useState<TableRecap[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Auto-backup status.
  const [autoState, setAutoState] = useState(() => readAutoBackupState());
  const [backupsPath, setBackupsPath] = useState<string | null>(null);
  useEffect(() => {
    backupsDirPath().then(setBackupsPath);
  }, []);

  async function onAutoBackupNow() {
    if (!companyId || busy) return;
    setBusy("auto");
    try {
      const r = await runDueBackup(companyId, { force: true });
      if (r.ran) {
        setAutoState(readAutoBackupState());
        toast(`${t("Daily backup saved")} · ${r.fileName} · ${r.rows} ${t("records")}`, "success");
      } else {
        toast(t("Automatic backup runs in the installed desktop app."), "info");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Backup failed."), "error");
    } finally {
      setBusy(null);
    }
  }

  // Only an administrator may back up, restore or wipe a device's data — a
  // cashier must never be able to reset the till. (SuperAdmin included.)
  const isAdmin = role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin;

  async function onBackup() {
    if (!companyId || busy) return;
    setBusy("backup");
    try {
      // exportAllData runs the tenant-isolation guard first, so the file can
      // only ever contain THIS company's data.
      const r = await exportAllData(companyId);
      toast(
        `${r.savedTo ? t("Backup saved to your Downloads folder") : t("Backup downloaded")} · ${r.fileName} · ${r.rowCount} ${t("records")}`,
        "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Backup failed."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onChooseFile(file: File | undefined) {
    if (!file || !companyId || busy) return;
    setParsed(null);
    setRecap([]);
    setBusy("analyze");
    try {
      const p = parseBackup(await file.text());
      const { companyMismatch, recap: rc } = await analyzeBackup(p, companyId);
      if (companyMismatch) {
        toast(t("This backup belongs to a different business — it can't be restored here."), "error");
        return;
      }
      if (rc.length === 0) {
        toast(t("This backup has no records to restore."), "info");
        return;
      }
      setParsed(p);
      setRecap(rc);
      setSel(new Set(rc.map((r) => r.name)));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Couldn't read this backup file."), "error");
    } finally {
      setBusy(null);
    }
  }

  function toggle(name: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  const allSelected = recap.length > 0 && recap.every((r) => sel.has(r.name));

  async function onRestore(mode: "add" | "replace") {
    if (!parsed || !companyId || busy) return;
    const chosen = recap.filter((r) => sel.has(r.name));
    if (chosen.length === 0) {
      toast(t("Pick at least one type of data to restore."), "info");
      return;
    }
    const totalNew = chosen.reduce((s, r) => s + r.newRows, 0);
    const totalOverwrite = chosen.reduce((s, r) => s + r.existing, 0);
    const ok = await confirmDialog({
      danger: mode === "replace",
      title: mode === "add" ? t("Add records from backup?") : t("Replace with backup?"),
      message:
        mode === "add"
          ? `${t("New records will be added; existing records are kept unchanged.")} (${totalNew} ${t("new")})`
          : `${t("Existing matching records will be OVERWRITTEN with the backup's version, and new ones added.")} (${totalOverwrite} ${t("to overwrite")}, ${totalNew} ${t("new")})`,
      confirmLabel: mode === "add" ? t("Add new") : t("Replace selected"),
    });
    if (!ok) return;

    setBusy("restore");
    try {
      const r = await applyRestore(parsed, companyId, [...sel], mode);
      // Refresh on-screen data without a full reload (a reload would trigger a
      // server pull that could overwrite what we just restored).
      queryClient.invalidateQueries();
      toast(`${t("Restore complete")} · ${r.inserted} ${t("added")}, ${r.updated} ${t("updated")}, ${r.skipped} ${t("skipped")}`, "success");
      setParsed(null);
      setRecap([]);
      setSel(new Set());

      // Make restored data official: unsynced sales/shifts can be promoted to
      // the server (idempotent push). Catalog/customers stay server-owned. Ask
      // the admin to confirm — this is what makes a restore authoritative.
      const pending = await countUnsyncedTransactions(companyId);
      if (pending > 0) {
        const send = await confirmDialog({
          title: t("Make restored sales official?"),
          message: t("Some restored sales aren't on the server yet. Send them so they become official for every device. Already-synced sales and your catalogue are handled automatically."),
          confirmLabel: t("Send to server"),
        });
        if (send) {
          try {
            const sr = await runSync();
            toast(
              `${t("Sent to server")} · ${sr.salesPushed ?? 0} ${t("sales")}${sr.salesFailed ? ` · ${sr.salesFailed} ${t("failed")}` : ""}`,
              sr.salesFailed ? "error" : "success",
            );
          } catch (e) {
            toast(e instanceof Error ? e.message : t("Couldn't reach the server — try Sync later."), "error");
          }
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Restore failed."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    if (!companyId || busy) return;
    const ok = await confirmDialog({
      danger: true,
      title: t("Reset all data on this device?"),
      message: t(
        "This permanently clears every record stored on THIS device and signs you out. Your business data on the server is safe and will download again the next time you sign in. Any sales not yet synced to the server will be lost.",
      ),
      confirmLabel: t("Reset everything"),
    });
    if (!ok) return;

    setBusy("reset");
    try {
      try {
        await runSync();
      } catch {
        const proceed = await confirmDialog({
          danger: true,
          title: t("Couldn't reach the server"),
          message: t("Some sales may not be synced yet. If you reset now, they will be lost. Reset anyway?"),
          confirmLabel: t("Reset anyway"),
        });
        if (!proceed) {
          setBusy(null);
          return;
        }
      }
      await resetAllData();
      logout();
      toast(t("All local data cleared. Signing out…"), "success");
      setTimeout(() => {
        window.location.hash = "#/onboarding";
        window.location.reload();
      }, 700);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Reset failed."), "error");
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-card border border-border bg-surface p-6 text-center">
          <div className="text-3xl">🔒</div>
          <div className="mt-2 text-lg font-bold text-text-primary">{t("Administrators only")}</div>
          <p className="mt-1 text-sm text-text-secondary">
            {t("Backing up and resetting device data is restricted to a company administrator.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">🛟 {t("Data & maintenance")}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("Back up this device's data, restore it, or clear it for a clean start.")}
          {company ? ` · ${company.name}` : ""}
        </p>
      </div>

      {/* Automatic daily backup — the always-on offline safety net */}
      <div className="rounded-card border border-success/40 bg-success/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-text-primary">🛡️ {t("Automatic daily backup")}</div>
          <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">{t("On")}</span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {t("A full snapshot is saved automatically once a day (around 2 AM, or at the first launch afterwards) and the last 14 days are kept — so yesterday's work is always safe, even with no internet for months. Each day is its own file, so today's work can never overwrite yesterday's snapshot.")}
        </p>
        <div className="mt-3 space-y-1 rounded-xl bg-surface/60 p-3 text-xs">
          <div>
            <span className="text-text-secondary">{t("Last backup")}: </span>
            <span className="font-semibold text-text-primary">
              {autoState ? `${new Date(autoState.at).toLocaleString()} · ${autoState.rows} ${t("records")}` : t("not yet")}
            </span>
          </div>
          <div>
            <span className="text-text-secondary">{t("Saved in")}: </span>
            <span className="break-all font-mono text-text-primary">
              {backupsPath ?? t("this device's app-data folder (in the installed app)")}
            </span>
          </div>
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={onAutoBackupNow} loading={busy === "auto"} disabled={!!busy}>
            🛡️ {t("Run a daily backup now")}
          </Button>
        </div>
      </div>

      {/* Back up */}
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="text-sm font-bold text-text-primary">💾 {t("Back up data (to Downloads)")}</div>
        <p className="mt-1 text-xs text-text-secondary">
          {t("Save a full snapshot of everything stored on this device to a single file (in your Downloads folder). Keep it somewhere safe as an extra copy.")}
        </p>
        <div className="mt-3">
          <Button onClick={onBackup} loading={busy === "backup"} disabled={!!busy}>
            💾 {t("Back up now")}
          </Button>
        </div>
      </div>

      {/* Restore */}
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="text-sm font-bold text-text-primary">📥 {t("Restore from a backup")}</div>
        <p className="mt-1 text-xs text-text-secondary">
          {t("Upload a backup file, review what matches your current data, then choose to add only the new records or replace existing ones.")}
        </p>
        <p className="mt-1 rounded-lg bg-accent-blue/10 px-3 py-2 text-[11px] text-accent-blue">
          ℹ️ {t("Restore works on this device. Your catalogue and customers stay owned by the server (they reconcile on the next sync); only sales not yet synced can be sent up to become official — you'll be asked to confirm after restoring.")}
        </p>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:bg-background">
            📂 {t("Choose backup file")}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                onChooseFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {busy === "analyze" ? <p className="mt-3 text-xs text-text-secondary">{t("Analysing backup…")}</p> : null}

        {parsed && recap.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t("Backup contents")}
                {parsed.exportedAt ? ` · ${new Date(parsed.exportedAt).toLocaleString()}` : ""}
              </div>
              <button
                onClick={() => setSel(allSelected ? new Set() : new Set(recap.map((r) => r.name)))}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {allSelected ? t("Select none") : t("Select all")}
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {recap.map((r) => (
                <label key={r.name} className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-background">
                  <input type="checkbox" checked={sel.has(r.name)} onChange={() => toggle(r.name)} className="h-4 w-4" />
                  <span className="flex-1 text-sm text-text-primary">{t(TABLE_LABELS[r.name] ?? r.name)}</span>
                  <span className="text-xs text-text-secondary">
                    {r.fileRows} {t("in file")}
                    {r.existing > 0 ? <span className="text-accent-amber"> · {r.existing} {t("match")}</span> : null}
                    {r.newRows > 0 ? <span className="text-success"> · {r.newRows} {t("new")}</span> : null}
                  </span>
                </label>
              ))}
            </div>

            <p className="text-[11px] text-text-secondary">
              {t("“Add” keeps your current records and only inserts new ones. “Replace” overwrites the matching (amber) records with the backup's version.")}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" onClick={() => onRestore("add")} loading={busy === "restore"} disabled={!!busy}>
                ➕ {t("Add new only")}
              </Button>
              <Button variant="danger" onClick={() => onRestore("replace")} loading={busy === "restore"} disabled={!!busy}>
                ♻️ {t("Replace selected")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Reset / complete refresh */}
      <div className="rounded-card border border-error/40 bg-error/5 p-5">
        <div className="text-sm font-bold text-error">♻️ {t("Reset app data (complete refresh)")}</div>
        <p className="mt-1 text-xs text-text-secondary">
          {t("Clears all data stored on this device and signs you out — for a clean start or to fix a glitchy device. Your business data on the server is not touched and downloads again when you sign back in.")}
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
          <li>{t("Only affects this device — never another business's data.")}</li>
          <li>{t("Sync first if possible — unsynced sales cannot be recovered.")}</li>
        </ul>
        <div className="mt-3">
          <Button variant="danger" onClick={onReset} loading={busy === "reset"} disabled={!!busy}>
            ♻️ {t("Reset everything")}
          </Button>
        </div>
      </div>
    </div>
  );
}
