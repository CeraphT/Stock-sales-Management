import { useToast, type ToastKind } from "@/lib/toast";

const TONE: Record<ToastKind, { border: string; text: string; icon: string }> = {
  success: { border: "border-success/40", text: "text-success", icon: "✓" },
  error: { border: "border-error/40", text: "text-error", icon: "⚠" },
  info: { border: "border-border", text: "text-text-primary", icon: "•" },
};

export function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.kind];
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`card-in pointer-events-auto flex cursor-pointer items-center gap-2.5 rounded-xl border bg-surface px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${tone.border}`}
          >
            <span className={`text-base font-bold ${tone.text}`}>{tone.icon}</span>
            <span className="text-text-primary">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
