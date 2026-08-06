import { UserRole } from "@stockflow/core/api/enums";
import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";
import { toast } from "@/lib/toast";

function roleLabel(role: UserRole, t: (s: string) => string): string {
  if (role === UserRole.SuperAdmin) return t("Super admin");
  if (role === UserRole.CompanyAdmin) return t("Admin");
  return t("Cashier");
}

export function SuperAdminCompanyDetail() {
  const t = useT();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const enter = useImpersonation((s) => s.enter);
  const [entering, setEntering] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "company", id],
    queryFn: () => superAdminApi.getCompany(id),
    enabled: !!id,
  });

  async function onEnter() {
    setEntering(true);
    try {
      const resp = await superAdminApi.impersonate(id);
      enter(resp);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Could not enter company"), "error");
      setEntering(false);
    }
  }

  if (isLoading) {
    return <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">
        {error instanceof Error ? error.message : t("Company not found.")}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate("/superadmin/companies")} className="mb-3 text-sm font-medium text-text-secondary transition hover:text-primary">
        ← {t("Companies")}
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{data.name}</h1>
          <p className="mt-1 font-mono text-xs text-text-secondary">{data.uniqueCode}</p>
        </div>
        <Button loading={entering} onClick={onEnter}>
          {t("Enter company →")}
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="👥" label={t("Users")} value={String(data.userCount)} color="blue" index={0} />
        <StatCard icon="📦" label={t("Products")} value={String(data.productCount)} color="primary" index={1} />
        <StatCard icon="🧾" label={t("Sales")} value={String(data.salesCount)} color="green" index={2} />
        <StatCard icon="💰" label={t("Revenue")} value={data.totalRevenue.toLocaleString()} color="orange" index={3} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">{t("Users")}</h2>
          {data.users.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">{t("No users.")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{u.name}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{u.phone}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{roleLabel(u.role, t)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                        {u.active ? t("Active") : t("Inactive")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">{t("Locations")}</h2>
          {data.locations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">{t("No locations.")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.locations.map((l) => (
                  <tr key={l.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">📍 {l.name}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{l.address ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.active ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                        {l.active ? t("Active") : t("Inactive")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
