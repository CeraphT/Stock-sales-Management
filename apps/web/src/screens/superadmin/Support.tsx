import { supportApi } from "@stockflow/core/api/endpoints/support";
import { DevicePlatform } from "@stockflow/core/api/enums";
import { SupportTicketCategory, SupportTicketStatus, type SupportTicketSummary } from "@stockflow/core/api/types/support";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const STATUS = [
  { value: SupportTicketStatus.Open, label: "Open", cls: "bg-accent-amber/15 text-accent-amber" },
  { value: SupportTicketStatus.InProgress, label: "In progress", cls: "bg-accent-blue/15 text-accent-blue" },
  { value: SupportTicketStatus.Resolved, label: "Resolved", cls: "bg-success/15 text-success" },
  { value: SupportTicketStatus.Closed, label: "Closed", cls: "bg-text-secondary/15 text-text-secondary" },
];
const CATEGORY: Record<SupportTicketCategory, { label: string; icon: string }> = {
  [SupportTicketCategory.Bug]: { label: "Bug", icon: "🐞" },
  [SupportTicketCategory.Blocked]: { label: "I'm blocked", icon: "✋" },
  [SupportTicketCategory.Question]: { label: "Question", icon: "❓" },
};
const PLATFORM: Record<DevicePlatform, string> = {
  [DevicePlatform.Desktop]: "Desktop",
  [DevicePlatform.Mobile]: "Mobile",
  [DevicePlatform.Web]: "Web",
};

/** SuperAdmin console → Support: every request filed from the mobile, desktop
 * and web apps. Filter by status, read the context + screenshots, reply to the
 * user (shown in their "My requests") and move the request along. */
export function SuperAdminSupport() {
  const t = useT();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "active" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["superadmin", "support", "list"],
    queryFn: () => supportApi.list(),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    if (statusFilter === "all") return all;
    if (statusFilter === "active") return all.filter((r) => r.status === SupportTicketStatus.Open || r.status === SupportTicketStatus.InProgress);
    return all.filter((r) => r.status === statusFilter);
  }, [list.data, statusFilter]);
  const openCount = (list.data ?? []).filter((r) => r.status === SupportTicketStatus.Open).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t("Support")}
            {openCount > 0 ? <span className="ml-2 rounded-full bg-accent-amber/15 px-2.5 py-1 align-middle text-xs font-bold text-accent-amber">{openCount} {t("open")}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">{t("Bug reports and help requests from every app.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1">
          <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{t("Filter")}</span>
          {([["active", "Active"], ["all", "All"], ...STATUS.map((s) => [s.value, s.label] as const)] as const).map(([v, label]) => (
            <button
              key={String(v)}
              onClick={() => setStatusFilter(v as typeof statusFilter)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${statusFilter === v ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          {list.isLoading ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
          ) : list.error ? (
            <div className="rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">{(list.error as Error).message}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("No requests.")}</div>
          ) : (
            rows.map((r: SupportTicketSummary) => {
              const st = STATUS[r.status] ?? STATUS[0];
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-card border bg-surface p-4 text-left transition hover:border-primary/50 ${selectedId === r.id ? "border-primary" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-text-primary">
                        {CATEGORY[r.category]?.icon} {r.title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-text-secondary">
                        {r.companyName ?? t("No business")} · {r.userName} · {PLATFORM[r.platform] ?? "—"}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{t(st.label)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-text-secondary">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.attachmentCount > 0 ? ` · ${r.attachmentCount} 🖼️` : ""}
                    {r.adminReply ? ` · ✉️ ${t("replied")}` : ""}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div>
          {selectedId ? (
            <TicketDetail
              id={selectedId}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["superadmin", "support"] })}
            />
          ) : (
            <div className="rounded-card border border-dashed border-border p-10 text-center text-sm text-text-secondary">
              {t("Select a request to see its details.")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useT();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ["superadmin", "support", id], queryFn: () => supportApi.get(id) });

  // Attachments need the auth header → fetched as blobs, shown via object URLs.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const atts = detail.data?.attachments ?? [];
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const a of atts) {
        try {
          const url = URL.createObjectURL(await supportApi.attachment(id, a.id));
          created.push(url);
          next[a.id] = url;
        } catch {
          /* leave it out */
        }
      }
      if (!cancelled) setImageUrls(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id, detail.data?.attachments]);

  useEffect(() => setReply(""), [id]);

  if (detail.isLoading || !detail.data) {
    return <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>;
  }
  const d = detail.data;

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast(okMsg, "success");
      await detail.refetch();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Something went wrong."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {CATEGORY[d.category]?.icon} {t(CATEGORY[d.category]?.label ?? "Bug")} · {new Date(d.createdAt).toLocaleString()}
        </div>
        <h2 className="mt-1 text-lg font-bold text-text-primary">{d.title}</h2>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-background/60 p-3 text-xs">
        <dt className="text-text-secondary">{t("Business")}</dt>
        <dd className="text-text-primary">{d.companyName ?? "—"}</dd>
        <dt className="text-text-secondary">{t("User")}</dt>
        <dd className="text-text-primary">
          {d.userName}
          {d.userPhone ? ` · ${d.userPhone}` : ""}
        </dd>
        <dt className="text-text-secondary">{t("App")}</dt>
        <dd className="text-text-primary">
          {PLATFORM[d.platform] ?? "—"} {d.appVersion ? `v${d.appVersion}` : ""}
        </dd>
        <dt className="text-text-secondary">{t("Screen")}</dt>
        <dd className="break-all font-mono text-text-primary">{d.screen ?? "—"}</dd>
        <dt className="text-text-secondary">{t("Device")}</dt>
        <dd className="break-all text-text-primary">{d.deviceInfo ?? "—"}</dd>
      </dl>

      <div className="whitespace-pre-wrap rounded-xl border border-border p-3 text-sm text-text-primary">{d.description}</div>

      {d.attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {d.attachments.map((a) =>
            imageUrls[a.id] ? (
              <button key={a.id} onClick={() => setPreview(imageUrls[a.id])} title={a.fileName}>
                <img src={imageUrls[a.id]} alt={a.fileName} className="h-28 w-28 rounded-xl border border-border object-cover transition hover:opacity-90" />
              </button>
            ) : (
              <div key={a.id} className="grid h-28 w-28 place-items-center rounded-xl border border-border text-xs text-text-secondary">…</div>
            ),
          )}
        </div>
      ) : null}

      {d.adminReply ? (
        <div className="rounded-xl bg-primary/5 p-3">
          <div className="text-[11px] font-bold text-primary">
            {t("Your reply")} · {d.repliedAt ? new Date(d.repliedAt).toLocaleString() : ""}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">{d.adminReply}</div>
        </div>
      ) : null}

      <div className="space-y-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder={t("Reply to the user (shown in their “My requests”)…")}
          className="w-full rounded-xl border border-border bg-background p-3 text-sm text-text-primary outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            loading={busy}
            disabled={!reply.trim()}
            onClick={() =>
              run(async () => {
                await supportApi.reply(id, reply.trim());
                setReply("");
              }, t("Reply sent."))
            }
          >
            {t("Send reply")}
          </Button>
          <span className="mx-1 text-xs text-text-secondary">{t("Status")}:</span>
          {STATUS.map((s) => (
            <button
              key={s.value}
              disabled={busy || d.status === s.value}
              onClick={() => run(() => supportApi.setStatus(id, s.value), t("Status updated."))}
              className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-100 ${d.status === s.value ? s.cls + " ring-1 ring-current" : "border border-border text-text-secondary hover:text-text-primary"}`}
            >
              {t(s.label)}
            </button>
          ))}
        </div>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setPreview(null)}>
          <img src={preview} alt="" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      ) : null}
    </div>
  );
}
