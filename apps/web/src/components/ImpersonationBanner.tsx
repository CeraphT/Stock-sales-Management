import { useNavigate } from "react-router-dom";

import { useT } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";

/** Persistent bar shown across the top of the scoped app while a SuperAdmin is
 * operating inside a company, so it's never ambiguous whose data is on screen.
 * "Exit" restores the SuperAdmin's own session and returns to the console. */
export function ImpersonationBanner() {
  const t = useT();
  const navigate = useNavigate();
  const active = useImpersonation((s) => s.active);
  const companyName = useImpersonation((s) => s.companyName);
  const exit = useImpersonation((s) => s.exit);

  if (!active) return null;

  function onExit() {
    exit();
    navigate("/superadmin", { replace: true });
  }

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
        className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold transition hover:bg-white/30"
      >
        {t("Exit to console")}
      </button>
    </div>
  );
}
