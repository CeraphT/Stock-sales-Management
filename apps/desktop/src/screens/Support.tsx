import { NetworkError } from "@stockflow/core/api/client";
import { supportApi } from "@stockflow/core/api/endpoints/support";
import { DevicePlatform } from "@stockflow/core/api/enums";
import {
  SupportTicketCategory,
  SupportTicketStatus,
  type SupportAttachmentUpload,
  type SupportTicketSummary,
} from "@stockflow/core/api/types/support";
import {
  SUPPORT_MAX_IMAGE_BYTES,
  SUPPORT_MAX_IMAGES,
  SUPPORT_MAX_TOTAL_BYTES,
  submitSupportTicket,
} from "@stockflow/core/support/submitSupportTicket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { getLastScreen } from "@/lib/lastScreen";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import pkg from "../../package.json";

// The one difference between the desktop and web copies of this screen.
const PLATFORM = DevicePlatform.Desktop;
const CAN_QUEUE_OFFLINE = true; // desktop has the local outbox; web is online-first

type Picked = SupportAttachmentUpload & { previewUrl: string; size: number };

const CATEGORIES = [
  { value: SupportTicketCategory.Bug, label: "Bug", icon: "🐞" },
  { value: SupportTicketCategory.Blocked, label: "I'm blocked", icon: "✋" },
  { value: SupportTicketCategory.Question, label: "Question", icon: "❓" },
];
const STATUS = [
  { label: "Open", cls: "bg-accent-amber/15 text-accent-amber" },
  { label: "In progress", cls: "bg-accent-blue/15 text-accent-blue" },
  { label: "Resolved", cls: "bg-success/15 text-success" },
  { label: "Closed", cls: "bg-success/15 text-success" },
];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** In-app Support: report a bug / a blocking problem / a question with
 * screenshots (pick files or paste from the clipboard). Context — app version,
 * platform, browser, the screen the user came from, business, user — is
 * attached automatically. "My requests" shows status and the support reply. */
export function Support() {
  const t = useT();
  const companyId = useAuthStore((s) => s.companyId);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [category, setCategory] = useState(SupportTicketCategory.Bug);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<Picked[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const screen = getLastScreen();
  // ?ticket=<id> (from the reply pop-up) opens that request's conversation.
  const [params, setParams] = useSearchParams();
  const openTicketId = params.get("ticket");
  useEffect(() => {
    if (openTicketId) setTab("mine");
  }, [openTicketId]);
  const openTicket = (id: string | null) => setParams(id ? { ticket: id } : {});

  const mine = useQuery({
    queryKey: ["support", "mine"],
    queryFn: () => supportApi.mine(),
    enabled: tab === "mine",
    retry: false,
  });

  async function addFiles(files: File[]) {
    const next = [...images];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (next.length >= SUPPORT_MAX_IMAGES) {
        toast(`${SUPPORT_MAX_IMAGES} ${t("images maximum.")}`, "error");
        break;
      }
      if (file.size > SUPPORT_MAX_IMAGE_BYTES) {
        toast(`"${file.name}" ${t("is larger than 5 MB.")}`, "error");
        continue;
      }
      next.push({
        fileName: file.name || "screenshot.png",
        contentType: file.type,
        dataBase64: await readAsBase64(file),
        previewUrl: URL.createObjectURL(file),
        size: file.size,
      });
    }
    if (next.reduce((s, i) => s + i.size, 0) > SUPPORT_MAX_TOTAL_BYTES) {
      toast(t("Images too large in total (15 MB max)."), "error");
      return;
    }
    setImages(next);
  }

  // Paste a screenshot straight from the clipboard (Print Screen / Win+Shift+S).
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  async function onSubmit() {
    if (!description.trim()) {
      toast(t("Please describe the problem before sending."), "error");
      return;
    }
    setSending(true);
    try {
      const result = await submitSupportTicket(
        {
          category,
          description: description.trim(),
          platform: PLATFORM,
          appVersion: pkg.version,
          deviceInfo: navigator.userAgent.slice(0, 300),
          screen,
          attachments: images.map(({ fileName, contentType, dataBase64 }) => ({ fileName, contentType, dataBase64 })),
        },
        { companyId, canQueueOffline: CAN_QUEUE_OFFLINE },
      );
      toast(
        result === "sent"
          ? t("Request sent — we'll get back to you here.")
          : t("No connection — your request is saved and will be sent automatically."),
        result === "sent" ? "success" : "info",
      );
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      setDescription("");
      setImages([]);
      setTab("mine");
    } catch (err) {
      toast(
        err instanceof NetworkError ? t("No connection — try again once connected.") : err instanceof Error ? err.message : t("Something went wrong."),
        "error",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl" onPaste={onPaste}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("Support")}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t("Report a bug, a blocking problem or ask a question — with screenshots.")}</p>
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
          {(["new", "mine"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === k ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              {k === "new" ? t("New request") : t("My requests")}
            </button>
          ))}
        </div>
      </div>

      {tab === "new" ? (
        <div className="space-y-5 rounded-card border border-border bg-surface p-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">{t("What's happening?")}</div>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-xl border p-3 text-sm font-semibold transition ${category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:border-primary/40"}`}
                >
                  <div className="text-xl">{c.icon}</div>
                  {t(c.label)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">{t("Describe the problem")}</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder={t("What were you doing, what did you expect, what happened instead? The more detail, the faster we can help.")}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm text-text-primary outline-none focus:border-primary"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
              {t("Screenshots")} <span className="font-normal normal-case">({t("click to add, or paste with Ctrl+V")})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={img.previewUrl} className="relative">
                  <img src={img.previewUrl} alt={img.fileName} className="h-24 w-24 rounded-xl border border-border object-cover" />
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(img.previewUrl);
                      setImages((list) => list.filter((_, j) => j !== i));
                    }}
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-error text-xs font-bold text-white"
                    aria-label={t("Remove")}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {images.length < SUPPORT_MAX_IMAGES ? (
                <button
                  onClick={() => fileInput.current?.click()}
                  className="grid h-24 w-24 place-items-center rounded-xl border border-dashed border-border text-xs font-semibold text-primary transition hover:bg-primary/5"
                >
                  🖼️
                  <span>{t("Add image")}</span>
                </button>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 p-3 text-xs text-text-secondary">
            ℹ️ {t("Sent automatically with your request: app version, device, your business and the screen you came from")} ({screen ?? "—"}).
          </div>

          <Button onClick={onSubmit} loading={sending} className="w-full">
            {t("Send to support")}
          </Button>
        </div>
      ) : openTicketId ? (
        <MyTicket id={openTicketId} onBack={() => openTicket(null)} onChanged={() => void mine.refetch()} />
      ) : (
        <div className="space-y-2">
          {mine.isLoading ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
          ) : mine.error ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">
              {mine.error instanceof NetworkError ? t("Offline — your requests can't be loaded right now.") : (mine.error as Error).message}
            </div>
          ) : (mine.data ?? []).length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("No requests yet.")}</div>
          ) : (
            (mine.data as SupportTicketSummary[]).map((tk) => (
              <button
                key={tk.id}
                onClick={() => openTicket(tk.id)}
                className={`block w-full rounded-card border bg-surface p-4 text-left transition hover:border-primary/50 ${tk.unreadByReporter ? "border-primary" : "border-border"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-text-primary">
                    {tk.unreadByReporter ? <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-primary align-middle" /> : null}
                    {tk.title}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[tk.status]?.cls ?? STATUS[0].cls}`}>
                    {t(STATUS[tk.status]?.label ?? "Open")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  {new Date(tk.createdAt).toLocaleString()}
                  {tk.attachmentCount > 0 ? ` · ${tk.attachmentCount} 🖼️` : ""}
                </div>
                {tk.adminReply ? (
                  <div className="mt-3 rounded-xl bg-primary/5 p-3">
                    <div className="text-[11px] font-bold text-primary">{t("Support reply")}</div>
                    <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-text-primary">{tk.adminReply}</div>
                  </div>
                ) : null}
                {tk.unreadByReporter ? <div className="mt-2 text-xs font-bold text-primary">{t("New reply — click to read")}</div> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}


/** One of the user's requests: the conversation with support + a reply box.
 * Opening it marks support's reply as read; replying to a resolved request
 * reopens it. */
function MyTicket({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const detail = useQuery({ queryKey: ["support", "mine", id], queryFn: () => supportApi.mineDetail(id), retry: false });

  useEffect(() => {
    if (detail.data) onChanged(); // the server just cleared the unread flag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.id]);

  if (detail.isLoading) {
    return <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>;
  }
  if (detail.error || !detail.data) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">
        {detail.error instanceof NetworkError ? t("Offline — your requests can't be loaded right now.") : (detail.error as Error | null)?.message}
      </div>
    );
  }
  const d = detail.data;
  const resolved = d.status === SupportTicketStatus.Resolved || d.status === SupportTicketStatus.Closed;

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await supportApi.mineReply(id, reply.trim());
      setReply("");
      toast(resolved ? t("Your request has been reopened.") : t("Reply sent."), "success");
      await queryClient.invalidateQueries({ queryKey: ["support"] });
    } catch (e) {
      toast(e instanceof NetworkError ? t("No connection — try again once connected.") : e instanceof Error ? e.message : t("Something went wrong."), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm font-medium text-text-secondary transition hover:text-primary">
        ← {t("My requests")}
      </button>
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-text-primary">{d.title}</h2>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[d.status]?.cls ?? STATUS[0].cls}`}>
            {t(STATUS[d.status]?.label ?? "Open")}
          </span>
        </div>
        <div className="mt-1 text-xs text-text-secondary">{new Date(d.createdAt).toLocaleString()}</div>
        <div className="mt-4 space-y-3">
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary/10 p-3 text-sm text-text-primary">
            {d.description}
            {d.attachmentCount > 0 ? <div className="mt-1 text-[11px] text-text-secondary">{d.attachmentCount} 🖼️</div> : null}
          </div>
          {d.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3 text-sm text-text-primary ${m.fromSupport ? "rounded-tl-sm border border-border bg-background" : "ml-auto rounded-tr-sm bg-primary/10"}`}
            >
              {m.fromSupport ? <div className="mb-0.5 text-[11px] font-bold text-primary">{t("Support reply")}</div> : null}
              {m.body}
              <div className="mt-1 text-[10px] text-text-secondary">{new Date(m.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {resolved ? <div className="text-xs text-text-secondary">{t("This request is resolved. Replying will reopen it.")}</div> : null}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder={t("Reply to support…")}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm text-text-primary outline-none focus:border-primary"
          />
          <Button onClick={send} loading={sending} disabled={!reply.trim()}>
            {t("Send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
