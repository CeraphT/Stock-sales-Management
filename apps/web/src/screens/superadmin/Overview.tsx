import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";

export function SuperAdminOverview() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: () => superAdminApi.overview(),
    refetchInterval: 30000, // keep "live" figures fresh
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{t("Overview")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("Fleet activity across every business on StockFlow.")}</p>

      {error ? (
        <div className="mt-5 rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">
          {error instanceof Error ? error.message : t("Something went wrong.")}
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="🟢" color="green" index={0} label={t("Live devices (now)")} value={String(data?.liveDevices ?? 0)} hint={t("active in last 5 min")} to="/superadmin/devices" />
            <StatCard icon="👤" color="blue" index={1} label={t("Active users (24h)")} value={String(data?.activeUsers24h ?? 0)} />
            <StatCard icon="📆" color="primary" index={2} label={t("Active users (7d)")} value={String(data?.activeUsers7d ?? 0)} />
            <StatCard icon="🏢" color="orange" index={3} label={t("Companies")} value={String(data?.totalCompanies ?? 0)} hint={data ? `+${data.newCompanies7d} ${t("this week")}` : undefined} to="/superadmin/companies" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="👥" color="neutral" index={4} label={t("Total users")} value={String(data?.totalUsers ?? 0)} to="/superadmin/users" />
            <StatCard icon="💻" color="neutral" index={5} label={t("Registered devices")} value={String(data?.totalDevices ?? 0)} to="/superadmin/devices" />
            <StatCard icon="📱" color="neutral" index={6} label={t("New companies (7d)")} value={String(data?.newCompanies7d ?? 0)} />
            <StatCard icon="⏱️" color="neutral" index={7} label={t("Refreshes every")} value={t("30s")} />
          </div>

          <div className="mt-5 rounded-card border border-border bg-surface p-5">
            <div className="mb-4 text-sm font-bold text-text-primary">{t("Active platforms (last 7 days)")}</div>
            {isLoading || !data ? (
              <div className="text-sm text-text-secondary">{t("Loading…")}</div>
            ) : (
              <PlatformBars mobile={data.mobileActive7d} desktop={data.desktopActive7d} web={data.webActive7d} />
            )}
          </div>

          <button
            onClick={() => navigate("/superadmin/devices")}
            className="mt-4 text-sm font-medium text-primary transition hover:underline"
          >
            {t("View all devices & sessions →")}
          </button>
        </>
      )}
    </div>
  );
}

function PlatformBars({ mobile, desktop, web }: { mobile: number; desktop: number; web: number }) {
  const t = useT();
  const max = Math.max(mobile, desktop, web, 1);
  const rows: { label: string; icon: string; value: number; color: string }[] = [
    { label: t("Mobile"), icon: "📱", value: mobile, color: "rgb(var(--color-primary))" },
    { label: t("Desktop"), icon: "🖥️", value: desktop, color: "rgb(var(--color-accent-blue))" },
    { label: t("Web"), icon: "🌐", value: web, color: "rgb(var(--color-accent-orange))" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="flex w-24 shrink-0 items-center gap-2 text-sm text-text-secondary">
            <span>{r.icon}</span>
            {r.label}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }} />
          </div>
          <div className="w-10 shrink-0 text-right text-sm font-bold text-text-primary">{r.value}</div>
        </div>
      ))}
    </div>
  );
}
