import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { exitCompany, useImpersonation } from "@/lib/impersonation";
import { toast } from "@/lib/toast";

/** Persistent amber bar across the top of the scoped app while a SuperAdmin is
 * operating inside a company, so it's never ambiguous whose data is on screen.
 * Desktop twin of apps/web/src/components/ImpersonationBanner.tsx — but "Exit"
 * returns to the company picker (/companies; the full fleet console stays on
 * the web) and first pushes/wipes the local mirror (see exitCompany). Also
 * leaves automatically when the ~2 h impersonation token expires. */
export function ImpersonationBanner() {
  const t = useT();
  const navigate = useNavigate();
  const active = useImpersonation((s) => s.active);
  const companyName = useImpersonation((s) => s.companyName);
  const expiresAt = useImpersonation((s) => s.expiresAt);
  const [leaving, setLeaving] = useState(false);

  async function onExit() {
    setLeaving(true);
    try {
      let left = await exitCompany();
      if (!left) {
        const force = await confirmDialog({
          title: t("Unsynced changes"),
          message: t(
            "Some changes made on this computer couldn't be sent to the server (offline?). Leaving now will discard them from this computer.",
          ),
          confirmLabel: t("Leave anyway"),
          danger: true,
        });
        if (!force) return;
        left = await exitCompany({ force: true });
      }
      if (left) navigate("/companies", { replace: true });
    } finally {
      setLeaving(false);
    }
  }

  // Auto-exit at token expiry (checked once on mount, then every 30 s).
  useEffect(() => {
    if (!active || !expiresAt) return;
    const check = () => {
      if (Date.parse(expiresAt) <= Date.now()) {
        toast(t("Super-admin access expired — you've left the business."), "info");
        void exitCompany({ force: true }).then(() => navigate("/companies", { replace: true }));
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [active, expiresAt, navigate, t]);

  if (!active) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm text-white"
      style={{ backgroundColor: "rgb(217 119 6)" }}
    >
      <span className="truncate font-medium">
        <span aria-hidden>👁️ </span>
        {t("Super-admin view — you are managing")} <strong>{companyName}</strong>
      </span>
      <button
        onClick={onExit}
        disabled={leaving}
        className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold transition hover:bg-white/30 disabled:opacity-60"
      >
        {leaving ? t("Leaving…") : t("Exit")}
      </button>
    </div>
  );
}
