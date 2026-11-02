import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { BackupState, type BackupFile, type BackupSourceStatus } from "@stockflow/core/api/types/superAdmin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/** Same colours as the daily e-mail (BackupReportEmail.cs). */
const STATE_META: Record<BackupState, { label: string; color: string }> = {
  [BackupState.NoBackup]: { label: "No backup", color: "#9CA3AF" },
  [BackupState.Completed]: { label: "Completed", color: "#55C443" },
  [BackupState.CompletedWithErrors]: { label: "Completed with errors", color: "#F59E0B" },
  [BackupState.InProcess]: { label: "In progress", color: "#F2E205" },
  [BackupState.Unsuccessful]: { label: "Failed", color: "#F04A2E" },
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${u === 0 ? v.toFixed(0) : v.toFixed(v < 10 ? 2 : 1)} ${units[u]}`;
}

const FILES_SHOWN = 5;

/** Super-admin Backups: the status of every backup source of both apps (the
 * same data as the daily e-mail to infos@mfspace.lu, whose "Download" link
 * lands here) and the files themselves. `?source=` highlights one source. */
export function SuperAdminBackups() {
  const t = useT();
  const [params] = useSearchParams();
  const focus = params.get("source");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "backups"],
    queryFn: () => superAdminApi.backups(),
    refetchInterval: 5 * 60000,
  });

  useEffect(() => {
    if (!focus || !data) return;
    // After the page-enter animation, or the scroll lands short.
    const id = setTimeout(() => document.getElementById(`backup-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
    return () => clearTimeout(id);
  }, [focus, data]);

  const send = useMutation({
    mutationFn: () => superAdminApi.sendBackupReport(),
    onSuccess: (r) => toast(`${t("Report sent to")} ${r.to}`, "success"),
    onError: (e) => void confirmDialog({ title: t("Report not sent"), message: e instanceof Error ? e.message : String(e), confirmLabel: "OK" }),
  });

  const openPreview = useMutation({
    mutationFn: () => superAdminApi.backupReportPreview(),
    onSuccess: setPreview,
    onError: (e) => void confirmDialog({ title: t("Something went wrong."), message: e instanceof Error ? e.message : String(e), confirmLabel: "OK" }),
  });

  async function onSend() {
    if (await confirmDialog({ title: t("Send the backup report now?"), message: t("The daily report e-mail is sent right away, in addition to the automatic one.") }))
      send.mutate();
  }

  const sources = data?.sources ?? [];
  const ok = sources.filter((s) => s.state === BackupState.Completed).length;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-text-primary">{t("Backups")}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t("StockFlow and HouseBudget backups on the server. The same report is e-mailed every morning.")}
          </p>
        </div>
        <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>{t("Refresh")}</Button>
        <Button variant="secondary" onClick={() => openPreview.mutate()} loading={openPreview.isPending}>{t("E-mail preview")}</Button>
        <Button onClick={onSend} loading={send.isPending}>{t("Send report now")}</Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">{error instanceof Error ? error.message : t("Something went wrong.")}</div>
      ) : isLoading ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label={t("Sources up to date")} value={`${ok}/${sources.length}`} tone={ok === sources.length ? "text-success" : "text-error"} />
            <Tile label={t("Backup storage")} value={formatSize(sources.reduce((a, s) => a + (s.storageBytes ?? 0), 0))} />
            <Tile label={t("Rows backed up")} value={sources.flatMap((s) => s.kpis).reduce((a, k) => a + k.count, 0).toLocaleString()} />
            <Tile label={t("Errors (28 days)")} value={String(sources.reduce((a, s) => a + s.errorCount, 0))} />
          </div>
          <div className="mt-4 space-y-4">
            {sources.map((s) => <SourceCard key={s.key} source={s} highlighted={s.key === focus} />)}
          </div>
          <p className="mt-4 text-xs text-text-secondary">
            {t("Restore a database with")} <code className="font-mono">pg_restore -d &lt;database&gt; &lt;file&gt;.dump</code>. {t("Every download is recorded in the audit log.")}
          </p>
        </>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-card bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="mr-auto truncate text-sm font-semibold text-text-primary">{preview.subject}</span>
              <Button variant="secondary" onClick={() => setPreview(null)}>{t("Close")}</Button>
            </div>
            {/* The e-mail is light-only HTML; render it on white whatever the theme. */}
            <iframe title={preview.subject} srcDoc={preview.html} sandbox="" className="flex-1 bg-white" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function SourceCard({ source: s, highlighted }: { source: BackupSourceStatus; highlighted: boolean }) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const meta = STATE_META[s.state];
  const files = showAll ? s.files : s.files.slice(0, FILES_SHOWN);

  return (
    <div
      id={`backup-${s.key}`}
      className={`overflow-hidden rounded-card border bg-surface ${highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
      style={{ borderLeft: `6px solid ${meta.color}` }}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 p-4">
        <div className="min-w-48 mr-auto">
          <div className="text-base font-bold text-text-primary">{s.name}</div>
          <div className="text-xs text-text-secondary">{s.application} · {s.type}</div>
          <div className="text-xs text-text-secondary">{s.location}</div>
        </div>
        <Stat label={t("Data size")} value={formatSize(s.dataSizeBytes)} />
        <Stat label={t("Storage used")} value={formatSize(s.storageBytes)} />
        <div>
          <div className="text-xs text-text-secondary">{t("Last 28 days")}</div>
          <div className="mt-1 flex gap-px" title={t("Oldest on the left, today on the right")}>
            {s.history.map((h, i) => (
              <span key={i} className="h-4 w-1.5" style={{ backgroundColor: h === null ? "#D4D4D4" : STATE_META[h].color, opacity: i % 2 ? 0.7 : 1 }} />
            ))}
          </div>
        </div>
        <div className="min-w-40">
          <div className="text-sm font-semibold" style={{ color: meta.color === "#F2E205" ? "#A39600" : meta.color }}>{t(meta.label)}</div>
          <div className="text-xs text-text-secondary">
            {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString() : t("No successful backup")}
          </div>
          <div className="text-xs text-text-secondary">{t("Errors")}: {s.errorCount}</div>
        </div>
      </div>
      {s.note ? <div className="border-t border-border/60 px-4 py-2 text-xs" style={{ color: meta.color }}>{s.note}</div> : null}

      {s.kpis.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
          {s.kpis.map((k) => (
            <span key={k.label} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
              {k.label} <b className="text-text-primary">{k.count.toLocaleString()}</b>
              {k.delta ? <span className={k.delta > 0 ? "ml-1 text-success" : "ml-1 text-error"}>{k.delta > 0 ? `+${k.delta}` : k.delta}</span> : null}
            </span>
          ))}
        </div>
      ) : (
        <div className="border-t border-border/60 px-4 py-2 text-xs text-text-secondary">{s.dataSources.join(", ")}</div>
      )}

      {s.downloadable ? (
        <div className="border-t border-border/60">
          {s.files.length === 0 ? (
            <div className="px-4 py-3 text-sm text-text-secondary">{t("No backup file.")}</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {files.map((f) => <FileRow key={f.name} source={s.key} file={f} />)}
              </tbody>
            </table>
          )}
          {s.files.length > FILES_SHOWN ? (
            <button onClick={() => setShowAll(!showAll)} className="w-full border-t border-border/60 py-2 text-xs font-semibold text-primary hover:bg-primary/5">
              {showAll ? t("Show less") : `${t("Show all")} (${s.files.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function FileRow({ source, file }: { source: string; file: BackupFile }) {
  const t = useT();
  const download = useMutation({
    mutationFn: async () => {
      const blob = await superAdminApi.downloadBackup(source, file.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = source === "hb-exports" ? `housebudget-${file.name.replace("/", "-")}` : file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    onError: (e) => void confirmDialog({ title: t("Download failed"), message: e instanceof Error ? e.message : String(e), confirmLabel: "OK" }),
  });
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-4 py-2 font-mono text-xs text-text-primary">{file.label ? <span className="mr-2 font-sans font-semibold">{file.label}</span> : null}{file.name.split("/").pop()}</td>
      <td className="px-4 py-2 text-xs text-text-secondary">{new Date(file.createdAt).toLocaleString()}</td>
      <td className="px-4 py-2 text-right text-xs text-text-secondary">{formatSize(file.sizeBytes)}</td>
      <td className="w-32 px-4 py-1.5 text-right">
        <Button variant="secondary" className="whitespace-nowrap px-3 py-1 text-xs" onClick={() => download.mutate()} loading={download.isPending}>⬇ {t("Download")}</Button>
      </td>
    </tr>
  );
}
