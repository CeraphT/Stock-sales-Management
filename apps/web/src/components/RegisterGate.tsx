import { shiftsApi } from "@stockflow/core/api/endpoints/shifts";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { logout } from "@/lib/session";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

/**
 * Start-of-day freeze for cashiers. While a cashier has no open shift the whole
 * app is unreachable — this is the ONLY thing rendered — so the day cannot begin
 * (no sales, no navigation) until the opening cash float is recorded. Admins are
 * never gated. Mirrors mobile's RegisterGate.
 */
export function RegisterGate({ onOpened }: { onOpened: () => void }) {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const t = useT();
  const navigate = useNavigate();

  const [openingCash, setOpeningCash] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy || !companyId || !locationId) return;
    setBusy(true);
    try {
      await shiftsApi.open(companyId, locationId, { openingCashAmount: Number(openingCash) || 0 });
      toast("Cash register opened.", "success");
      onOpened();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the register.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("Open the cash register")}
      subtitle={t("Record the cash you're starting the day with. The app stays locked until the register is open.")}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Opening cash float")}</span>
        <input
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && open()}
          inputMode="decimal"
          placeholder="0"
          autoFocus
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
        />
      </label>
      <Button onClick={open} loading={busy} className="mt-4 w-full">
        {t("Open register")}
      </Button>
      <button
        onClick={() => {
          logout();
          navigate("/onboarding", { replace: true });
        }}
        className="mt-3 w-full text-center text-xs font-medium text-text-secondary transition hover:text-text-primary"
      >
        {t("Log out")}
      </button>
    </AuthLayout>
  );
}
