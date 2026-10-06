import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import type { SuperAdminCompanySummary } from "@stockflow/core/api/types/superAdmin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/Button";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useT } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";
import { logout } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { AppVersion } from "@/components/AppVersion";

/** SuperAdmin company picker — the desktop's landing screen for a SuperAdmin
 * (who has no company of their own). Entering a business swaps to its
 * impersonation token and opens the normal scoped app (the Shell then isolates
 * + syncs the local mirror for that company). The full fleet console
 * (devices, audit, admins…) deliberately stays on the web.
 * Mirrors apps/web/src/screens/superadmin/Companies.tsx and the mobile picker. */
export function CompanyPicker() {
  const t = useT();
  const navigate = useNavigate();
  const language = useLanguageStore((s) => s.language);
  const userName = useAuthStore((s) => s.user?.name);
  const enter = useImpersonation((s) => s.enter);
  const [search, setSearch] = useState("");
  const [entering, setEntering] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "companies"],
    queryFn: () => superAdminApi.listCompanies(),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter(
      (c) =>
        // A deactivated business is closed (the API also refuses to impersonate
        // it) — manage it from the web console instead. `!== false` keeps the
        // list working against an older API that doesn't send `active` yet.
        c.active !== false &&
        (!q || c.name.toLowerCase().includes(q) || c.uniqueCode.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, search]);

  // French uses the singular for 0 and 1 ("0 produit"), English only for 1.
  const count = (n: number, one: string, many: string) =>
    `${n} ${(language === "fr" ? n < 2 : n === 1) ? t(one) : t(many)}`;

  async function onEnter(c: SuperAdminCompanySummary) {
    setEntering(c.id);
    try {
      // Called with the SuperAdmin token, before enter() swaps the session.
      const resp = await superAdminApi.impersonate(c.id);
      enter(resp);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Could not enter this business."), "error");
      setEntering(null);
    }
  }

  return (
    <div className="relative min-h-screen">
      <ScreenBackground />
      <div className="relative mx-auto w-full max-w-3xl p-6 pt-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size={44} />
            <div>
              <div className="text-xl font-extrabold tracking-tight text-primary">StockFlow</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t("Super Admin")}
                {userName ? ` · ${userName}` : ""}
              </div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => logout()}>
            {t("Log out")}
          </Button>
        </div>

        <div className="rounded-card border border-border bg-surface p-6">
          <h1 className="text-xl font-bold text-text-primary">{t("Choose a business")}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t("Enter a business to view and manage its data as a super-admin. Access lasts about 2 hours.")}
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search by name or code")}
              className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              autoFocus
            />
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching && !isLoading}>
              ↻
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-xl bg-background" />
              ))
            ) : error ? (
              <div className="rounded-xl bg-error/10 p-4 text-sm text-error">
                {error instanceof Error ? error.message : t("Could not load businesses.")}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-text-secondary">{t("No businesses found.")}</div>
            ) : (
              rows.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onEnter(c)}
                  disabled={!!entering}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg">🏢</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-text-primary">{c.name}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {c.uniqueCode} · {count(c.productCount, "product", "products")} ·{" "}
                      {count(c.userCount, "user", "users")}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                    {entering === c.id ? t("Entering…") : `${t("Enter")} ›`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <AppVersion className="mt-4" />
      </div>
    </div>
  );
}
