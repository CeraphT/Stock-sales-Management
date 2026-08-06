import { dashboardApi } from "@stockflow/core/api/endpoints/dashboard";
import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { UserRole } from "@stockflow/core/api/enums";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AreaChart } from "@/components/AreaChart";
import { BarChart } from "@/components/BarChart";
import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const t = useT();

  const { data } = useQuery({
    queryKey: ["dashboard-summary", companyId],
    queryFn: () => dashboardApi.summary(companyId!),
    enabled: !!companyId,
  });

  // Revenue-trend range. 7d comes from the dashboard summary (fast); 30d/90d
  // pull a zero-filled daily series from the reports endpoint — the accurate
  // multi-day/multi-device source (sales are push-only, not in the local mirror).
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);
  const rangeFrom = new Date(Date.now() - (trendDays - 1) * 86_400_000).toISOString().slice(0, 10);
  const rangeTo = new Date().toISOString().slice(0, 10);
  const { data: extended } = useQuery({
    queryKey: ["dashboard-trend", companyId, trendDays],
    queryFn: () => reportsApi.salesSummary(companyId!, { from: rangeFrom, to: rangeTo }),
    enabled: !!companyId && trendDays !== 7,
  });

  const trend =
    trendDays === 7
      ? (data?.revenueTrend ?? []).map((p) => ({ label: p.date.slice(5, 10), value: p.revenue }))
      : (() => {
          const byDate = new Map((extended?.dailyBreakdown ?? []).map((d) => [d.date.slice(0, 10), d.revenue]));
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() - (trendDays - 1));
          return Array.from({ length: trendDays }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            return { label: key.slice(5, 10), value: byDate.get(key) ?? 0 };
          });
        })();
  const inStock = Math.max(0, (data?.totalProducts ?? 0) - (data?.lowStockCount ?? 0) - (data?.outOfStockCount ?? 0));
  const today = new Date().toISOString().slice(0, 10);

  const navigate = useNavigate();
  const isAdmin = user?.role === UserRole.CompanyAdmin || user?.role === UserRole.SuperAdmin;
  const negativeBatches = data?.negativeStockBatchCount ?? 0;
  const shiftConflicts = data?.autoClosedShiftConflictCount ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-text-primary">{t("Welcome")}{user ? `, ${user.name}` : ""} 👋</h2>
        <p className="text-sm text-text-secondary">{t("Here's how your business is doing today.")}</p>
      </div>

      {negativeBatches + shiftConflicts > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-card border border-error/30 bg-error/10 p-4">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-error">{t("Needs reconciliation")}</div>
            {negativeBatches > 0 ? (
              <div className="mt-0.5 text-xs text-text-secondary">
                {negativeBatches} {t("stock batch(es) went negative from an offline sale — adjust their stock.")}
              </div>
            ) : null}
            {shiftConflicts > 0 ? (
              <div className="mt-0.5 text-xs text-text-secondary">
                {shiftConflicts} {t("cash register shift(s) auto-closed after two devices opened one at the same time.")}
              </div>
            ) : null}
          </div>
          {isAdmin ? (
            <button
              onClick={() => navigate("/reconciliation")}
              className="shrink-0 rounded-lg bg-error/15 px-3 py-1.5 text-xs font-bold text-error transition hover:bg-error/25"
            >
              {t("Review")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard index={0} color="primary" icon="💰" label={t("Revenue today")} value={formatCurrency(data?.todayRevenue ?? 0, currency)} to={`/sales?from=${today}&to=${today}`} />
        <StatCard index={1} color="blue" icon="🧾" label={t("Sales today")} value={String(data?.todaySalesCount ?? 0)} to={`/sales?from=${today}&to=${today}`} />
        <StatCard index={2} color="neutral" icon="📦" label={t("Products")} value={String(data?.totalProducts ?? 0)} to="/products" />
        <StatCard index={3} color="amber" icon="⚠️" label={t("Low stock")} value={String(data?.lowStockCount ?? 0)} to="/products?stock=low_stock" />
        <StatCard index={4} color="red" icon="⛔" label={t("Out of stock")} value={String(data?.outOfStockCount ?? 0)} to="/products?stock=out_of_stock" />
        <StatCard index={5} color="orange" icon="⏳" label={t("Expiring soon")} value={String(data?.expiringSoonCount ?? 0)} to="/products?expiring=1" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-in rounded-card border border-border bg-surface p-5 lg:col-span-2" style={{ animationDelay: "260ms" }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-text-primary">{t("Revenue trend")}</div>
            <div className="flex rounded-full bg-background p-0.5">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    trendDays === d ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t(`${d}D`)}
                </button>
              ))}
            </div>
          </div>
          <AreaChart points={trend} />
        </div>

        <div className="card-in rounded-card border border-border bg-surface p-5" style={{ animationDelay: "300ms" }}>
          <div className="mb-4 text-sm font-bold text-text-primary">{t("Stock health")}</div>
          <BarChart
            bars={[
              { label: t("In stock"), value: inStock, color: "rgb(var(--color-success))" },
              { label: t("Low stock"), value: data?.lowStockCount ?? 0, color: "rgb(var(--color-accent-amber))" },
              { label: t("Out of stock"), value: data?.outOfStockCount ?? 0, color: "rgb(var(--color-error))" },
            ]}
          />
        </div>
      </div>

      {data?.recentSales?.length ? (
        <div className="card-in mt-4 overflow-hidden rounded-card border border-border bg-surface" style={{ animationDelay: "340ms" }}>
          <div className="border-b border-border px-5 py-3 text-sm font-bold text-text-primary">{t("Recent sales")}</div>
          <table className="w-full text-sm">
            <tbody>
              {data.recentSales.slice(0, 8).map((s) => (
                <tr key={s.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-background/50">
                  <td className="px-5 py-2.5 text-text-secondary">
                    {new Date(s.timestamp).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                  </td>
                  <td className="px-5 py-2.5 text-text-primary">{s.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{paymentMethodLabel(s.paymentMethod)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-text-primary">{formatCurrency(s.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
