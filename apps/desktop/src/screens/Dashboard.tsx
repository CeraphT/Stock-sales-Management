import { dashboardApi } from "@stockflow/core/api/endpoints/dashboard";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";

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

  const trend = (data?.revenueTrend ?? []).map((p) => ({ label: p.date.slice(5, 10), value: p.revenue }));
  const inStock = Math.max(0, (data?.totalProducts ?? 0) - (data?.lowStockCount ?? 0) - (data?.outOfStockCount ?? 0));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-text-primary">{t("Welcome")}{user ? `, ${user.name}` : ""} 👋</h2>
        <p className="text-sm text-text-secondary">{t("Here's how your business is doing today.")}</p>
      </div>

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
          <div className="mb-2 text-sm font-bold text-text-primary">{t("Revenue · last 7 days")}</div>
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
