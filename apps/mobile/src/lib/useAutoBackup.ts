import { useEffect } from 'react';

import { runDueBackup } from '@/lib/autoBackup';
import { useAuthStore } from '@/lib/auth/store';

/** Drives the daily local auto-backup while the app is open: a check on mount
 * (covers "first launch this morning") and every 20 min after. Failures are
 * swallowed — a backup problem must never interrupt the till. */
export function useAutoBackup(): void {
  const companyId = useAuthStore((s) => s.companyId);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    const tick = () => {
      if (active) void runDueBackup(companyId).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 20 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [companyId]);
}
