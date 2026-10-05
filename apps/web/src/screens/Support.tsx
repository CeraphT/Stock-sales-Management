import { NetworkError } from "@stockflow/core/api/client";
import { supportApi } from "@stockflow/core/api/endpoints/support";
import { DevicePlatform } from "@stockflow/core/api/enums";
import {
  SupportTicketCategory,
  type SupportAttachmentUpload,
  type SupportTicketSummary,
} from "@stockflow/core/api/types/support";
import {
  SUPPORT_MAX_IMAGE_BYTES,
  SUPPORT_MAX_IMAGES,
  SUPPORT_MAX_TOTAL_BYTES,
  submitSupportTicket,
} from "@stockflow/core/support/submitSupportTicket";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { getLastScreen } from "@/lib/lastScreen";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import pkg from "../../package.json";

// The one difference between the desktop and web copies of this screen.
const PLATFORM = DevicePlatform.Web;
const CAN_QUEUE_OFFLINE = false; // web is online-first; desktop/mobile queue offline

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
              <div key={tk.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-text-primary">{tk.title}</div>
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
                    <div className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">{tk.adminReply}</div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

