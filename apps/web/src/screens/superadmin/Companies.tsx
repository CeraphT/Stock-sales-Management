import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import type { SuperAdminCompanySummary } from "@stockflow/core/api/types/superAdmin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";
import { toast } from "@/lib/toast";

export function SuperAdminCompanies() {
  const t = useT();
  const navigate = useNavigate();
  const enter = useImpersonation((s) => s.enter);
  const [search, setSearch] = useState("");
  const [entering, setEntering] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "companies"],
    queryFn: () => superAdminApi.listCompanies(),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.uniqueCode.toLowerCase().includes(q),
    );
  }, [data, search]);

  async function onEnter(c: SuperAdminCompanySummary) {
    setEntering(c.id);
    try {
      const resp = await superAdminApi.impersonate(c.id);
      enter(resp);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Could not enter company"), "error");
      setEntering(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("Companies")}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t("Every business on StockFlow. Enter one to view and manage its data remotely.")}
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by name or code…")}
          className="w-64 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-text-primary outline-none focus:border-primary"
        />
      </div>

      {error ? (
        <div className="rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">
          {error instanceof Error ? error.message : t("Something went wrong.")}
        </div>
      ) : isLoading ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          {t("Loading…")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          {t("No companies found.")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">{t("Name")}</th>
                <th className="px-4 py-3 font-semibold">{t("Code")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Users")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Products")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Sales")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Revenue")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border/50 transition last:border-0 hover:bg-primary/5"
                  onClick={() => navigate(`/superadmin/companies/${c.id}`)}
                >
                  <td className="px-4 py-3 font-semibold text-text-primary">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{c.uniqueCode}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{c.userCount}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{c.productCount}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{c.salesCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">
                    {c.totalRevenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      loading={entering === c.id}
                      disabled={entering !== null}
                      onClick={() => onEnter(c)}
                      className="!px-3 !py-1.5 !text-xs"
                    >
                      {t("Enter →")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
