import { Button } from "@/components/Button";
import { useConfirm } from "@/lib/confirm";
import { useT } from "@/lib/i18n";

/** Renders the app-wide styled confirm dialog. Mounted once in main.tsx. */
export function ConfirmHost() {
  const { open, title, message, confirmLabel, cancelLabel, danger, respond } = useConfirm();
  const t = useT();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => respond(false)}>
      <div className="card-in w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {title ? <div className="mb-1.5 text-lg font-bold text-text-primary">{title}</div> : null}
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => respond(false)}>
            {cancelLabel ?? t("Cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => respond(true)}>
            {confirmLabel ?? t("Confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
