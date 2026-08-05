import { toast } from "@/lib/toast";

/** Catches errors that escape React's render tree — rejected promises and
 * uncaught runtime errors from event handlers, timers, async code. Without
 * this they vanish silently (a known failure mode of the webview: no dialog,
 * no console for the user). We log them and surface a non-blocking toast so a
 * cashier at least knows an action didn't complete, and can retry. */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unexpected error";
    console.error("[unhandledrejection]", reason);
    // Best-effort user hint; the store queues it even before the host mounts.
    try {
      toast(msg, "error");
    } catch {
      /* never let error reporting throw */
    }
  });

  window.addEventListener("error", (e) => {
    // Ignore resource-load errors (img/script) — only report real script errors.
    if (!e.error) return;
    console.error("[window.error]", e.error);
    try {
      toast(e.error instanceof Error ? e.error.message : "Unexpected error", "error");
    } catch {
      /* ignore */
    }
  });
}
