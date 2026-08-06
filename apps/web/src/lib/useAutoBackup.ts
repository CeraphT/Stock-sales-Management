import { useEffect } from "react";

import { runDueBackup } from "@/lib/autoBackup";
import { useAuthStore } from "@/lib/stores";

/** Drives the daily local auto-backup while the app is open: one check on mount
 * (covers "first launch this morning") and every 20 min after (covers a device
 * left running through 02:00). Failures are swallowed — a backup problem must
 * never interrupt the till. Native-only; a no-op in the browser. */
export function useAutoBackup(): void {
  const companyId = useAuthStore((s) => s.companyId);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    const tick = () => {
      if (active) void runDueBackup(companyId).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 20 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [companyId]);
}
