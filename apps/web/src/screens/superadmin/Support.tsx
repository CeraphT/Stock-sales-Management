import { supportApi } from "@stockflow/core/api/endpoints/support";
import { DevicePlatform } from "@stockflow/core/api/enums";
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  type SupportTicketSummary,
} from "@stockflow/core/api/types/support";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { useAuthStore } from "@/lib/stores";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const STATUS = [
  { value: SupportTicketStatus.Open, label: "Open", cls: "bg-accent-amber/15 text-accent-amber" },
  { value: SupportTicketStatus.InProgress, label: "In progress", cls: "bg-accent-blue/15 text-accent-blue" },
  { value: SupportTicketStatus.Resolved, label: "Resolved", cls: "bg-success/15 text-success" },
  { value: SupportTicketStatus.Closed, label: "Closed", cls: "bg-text-secondary/15 text-text-secondary" },
];
const PRIORITY = [
  { value: SupportTicketPriority.Low, label: "Low", cls: "bg-text-secondary/10 text-text-secondary", sla: "7 d" },
  { value: SupportTicketPriority.Normal, label: "Normal", cls: "bg-accent-blue/10 text-accent-blue", sla: "72 h" },
  { value: SupportTicketPriority.High, label: "High", cls: "bg-accent-orange/15 text-accent-orange", sla: "24 h" },
  { value: SupportTicketPriority.Urgent, label: "Urgent", cls: "bg-error/15 text-error", sla: "4 h" },
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

type Queue = "todo" | "mine" | "unassigned" | "late" | "resolved" | "all";
const isActive = (r: SupportTicketSummary) => r.status === SupportTicketStatus.Open || r.status === SupportTicketStatus.InProgress;

/** "due in 3 h" / "late by 2 h" from an ISO date. */
function dueLabel(t: (s: string) => string, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const span = abs >= 1440 ? `${Math.round(abs / 1440)} ${t("d")}` : abs >= 60 ? `${Math.round(abs / 60)} h` : `${abs} min`;
  return mins < 0 ? `${t("late by")} ${span}` : `${t("due in")} ${span}`;
}

/** SuperAdmin console → Support: the ticket-handling process (see
 * docs/support-process.md). Queue sorted by the server (awaiting support →
 * late → priority → due); take a request, reply (the user gets a pop-up), keep
 * internal notes, set priority/status. ?ticket=<id> deep-links from the
 * notification e-mail. */
export function SuperAdminSupport() {
  const t = useT();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("ticket");
  const select = (id: string | null) => setParams(id ? { ticket: id } : {});
  const [queue, setQueue] = useState<Queue>("todo");
  const myId = useAuthStore((s) => s.user?.id);

  const list = useQuery({ queryKey: ["superadmin", "support", "list"], queryFn: () => supportApi.list(), refetchInterval: 30000 });
  const summary = useQuery({ queryKey: ["superadmin", "support", "summary"], queryFn: () => supportApi.summary(), refetchInterval: 30000 });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    switch (queue) {
      case "todo": return all.filter((r) => isActive(r) && r.awaitingSupport);
      case "mine": return all.filter((r) => isActive(r) && !!myId && r.assignedToUserId === myId);
      case "unassigned": return all.filter((r) => isActive(r) && !r.assignedToName);
      case "late": return all.filter((r) => r.slaBreached);
      case "resolved": return all.filter((r) => !isActive(r));
      default: return all;
    }
  }, [list.data, queue, myId]);

  const s = summary.data;
  const QUEUES: { key: Queue; label: string; count?: number; tone?: string }[] = [
    { key: "todo", label: "To handle", count: s?.awaitingSupport, tone: "text-accent-amber" },
    { key: "late", label: "Late", count: s?.slaBreached, tone: "text-error" },
    { key: "unassigned", label: "Unassigned", count: s?.unassigned },
    { key: "mine", label: "Mine", count: s?.mine },
    { key: "resolved", label: "Resolved / closed" },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("Support")}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t("Bug reports and help requests from every app.")} {t("Response targets: Urgent 4 h · High 24 h · Normal 72 h · Low 7 d.")}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1">
        {QUEUES.map((q) => (
          <button
            key={q.key}
            onClick={() => setQueue(q.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${queue === q.key ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
          >
            {t(q.label)}
            {q.count ? <span className={`ml-1.5 ${queue === q.key ? "text-white" : q.tone ?? ""}`}>{q.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          {list.isLoading ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
          ) : list.error ? (
            <div className="rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">{(list.error as Error).message}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Nothing here. All caught up.")}</div>
          ) : (
            rows.map((r) => {
              const st = STATUS[r.status] ?? STATUS[0];
              const pr = PRIORITY[r.priority ?? SupportTicketPriority.Normal];
              const due = isActive(r) && r.awaitingSupport ? dueLabel(t, r.slaDueAt) : null;
              return (
                <button
                  key={r.id}
                  onClick={() => select(r.id)}
                  className={`w-full rounded-card border bg-surface p-4 text-left transition hover:border-primary/50 ${selectedId === r.id ? "border-primary" : r.slaBreached ? "border-error/50" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-text-primary">
                        {CATEGORY[r.category]?.icon} {r.title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-text-secondary">
                        {r.companyName ?? t("No business")} · {r.userName} · {PLATFORM[r.platform] ?? "-"}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{t(st.label)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${pr.cls}`}>{t(pr.label)}</span>
                    {due ? <span className={`rounded-full px-2 py-0.5 font-bold ${r.slaBreached ? "bg-error/15 text-error" : "bg-background text-text-secondary"}`}>⏱ {due}</span> : null}
                    {isActive(r) && !r.awaitingSupport ? <span className="rounded-full bg-background px-2 py-0.5 text-text-secondary">{t("waiting for the user")}</span> : null}
                    <span className="text-text-secondary">
                      {r.assignedToName ? `👤 ${r.assignedToName}` : t("Unassigned")} · {new Date(r.updatedAt).toLocaleString()}
                      {r.attachmentCount > 0 ? ` · ${r.attachmentCount} 🖼️` : ""}
                    </span>
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
  const [note, setNote] = useState("");
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

  useEffect(() => {
    setReply("");
    setNote("");
  }, [id]);

  if (detail.isLoading || !detail.data) {
    return <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>;
  }
  const d = detail.data;
  const active = d.status === SupportTicketStatus.Open || d.status === SupportTicketStatus.InProgress;

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {CATEGORY[d.category]?.icon} {t(CATEGORY[d.category]?.label ?? "Bug")} · {new Date(d.createdAt).toLocaleString()}
          </div>
          <h2 className="mt-1 text-lg font-bold text-text-primary">{d.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.assignedToName ? (
            <span className="text-xs text-text-secondary">👤 {d.assignedToName}</span>
          ) : null}
          <Button variant="secondary" disabled={busy} onClick={() => run(() => supportApi.assign(id, !d.assignedToName), d.assignedToName ? t("Released.") : t("Taken."))}>
            {d.assignedToName ? t("Release") : t("Take it")}
          </Button>
        </div>
      </div>

      {/* Triage: priority + response target */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-text-secondary">{t("Priority")}:</span>
        {PRIORITY.map((p) => (
          <button
            key={p.value}
            disabled={busy || d.priority === p.value}
            onClick={() => run(() => supportApi.setPriority(id, p.value), t("Priority updated."))}
            className={`rounded-full px-2.5 py-1 font-bold transition ${d.priority === p.value ? p.cls + " ring-1 ring-current" : "border border-border text-text-secondary hover:text-text-primary"}`}
            title={`${t("Response target")}: ${p.sla}`}
          >
            {t(p.label)}
          </button>
        ))}
        {active && d.awaitingSupport ? (
          <span className={`ml-2 rounded-full px-2.5 py-1 font-bold ${d.slaBreached ? "bg-error/15 text-error" : "bg-background text-text-secondary"}`}>
            ⏱ {dueLabel(t, d.slaDueAt)}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-background/60 p-3 text-xs">
        <dt className="text-text-secondary">{t("Business")}</dt>
        <dd className="text-text-primary">{d.companyName ?? "-"}</dd>
        <dt className="text-text-secondary">{t("User")}</dt>
        <dd className="text-text-primary">
          {d.userName}
          {d.userPhone ? ` · ${d.userPhone}` : ""}
        </dd>
        <dt className="text-text-secondary">{t("App")}</dt>
        <dd className="text-text-primary">
          {PLATFORM[d.platform] ?? "-"} {d.appVersion ? `v${d.appVersion}` : ""}
        </dd>
        <dt className="text-text-secondary">{t("Screen")}</dt>
        <dd className="break-all font-mono text-text-primary">{d.screen ?? "-"}</dd>
        <dt className="text-text-secondary">{t("Device")}</dt>
        <dd className="break-all text-text-primary">{d.deviceInfo ?? "-"}</dd>
      </dl>

      {/* Conversation: the request, then messages (internal notes highlighted). */}
      <div className="space-y-2">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border p-3 text-sm text-text-primary">
          <div className="mb-0.5 text-[11px] font-bold text-text-secondary">{d.userName}</div>
          {d.description}
        </div>
        {d.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {d.attachments.map((a) =>
              imageUrls[a.id] ? (
                <button key={a.id} onClick={() => setPreview(imageUrls[a.id])} title={a.fileName}>
                  <img src={imageUrls[a.id]} alt={a.fileName} className="h-24 w-24 rounded-xl border border-border object-cover transition hover:opacity-90" />
                </button>
              ) : (
                <div key={a.id} className="grid h-24 w-24 place-items-center rounded-xl border border-border text-xs text-text-secondary">…</div>
              ),
            )}
          </div>
        ) : null}
        {d.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] whitespace-pre-wrap rounded-2xl p-3 text-sm text-text-primary ${
              m.isInternal
                ? "ml-auto rounded-tr-sm border border-dashed border-accent-amber/60 bg-accent-amber/10"
                : m.fromSupport
                  ? "ml-auto rounded-tr-sm bg-primary/10"
                  : "rounded-tl-sm border border-border"
            }`}
          >
            <div className="mb-0.5 text-[11px] font-bold text-text-secondary">
              {m.isInternal ? `🔒 ${t("Internal note")} · ` : ""}
              {m.authorName} · {new Date(m.createdAt).toLocaleString()}
            </div>
            {m.body}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder={t("Reply to the user (they get a pop-up in their app)…")}
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
          <Button
            variant="secondary"
            disabled={busy || !reply.trim()}
            onClick={() =>
              run(async () => {
                await supportApi.reply(id, reply.trim(), SupportTicketStatus.Resolved);
                setReply("");
              }, t("Reply sent and request resolved."))
            }
          >
            {t("Reply & resolve")}
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-accent-amber/50 p-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("Internal note (never shown to the user)…")}
          className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <Button
          variant="secondary"
          disabled={busy || !note.trim()}
          onClick={() =>
            run(async () => {
              await supportApi.note(id, note.trim());
              setNote("");
            }, t("Note added."))
          }
        >
          🔒 {t("Add internal note")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className="mr-1 text-xs font-semibold text-text-secondary">{t("Change status")}:</span>
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
        <span className="ml-auto text-[11px] text-text-secondary">{t("Resolved → the user is notified; auto-closed after 7 days.")}</span>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setPreview(null)}>
          <img src={preview} alt="" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      ) : null}
    </div>
  );
}
