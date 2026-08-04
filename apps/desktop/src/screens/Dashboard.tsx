import { dashboardApi } from "@stockflow/core/api/endpoints/dashboard";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

function StatTile({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</div>
    </div>
  );
}

function HealthRow({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="text-sm font-bold text-text-primary">{value}</span>
    </div>
  );
}

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();

  const { data } = useQuery({
    queryKey: ["dashboard-summary", companyId],
    queryFn: () => dashboardApi.summary(companyId!),
    enabled: !!companyId,
  });

  const trend = data?.revenueTrend ?? [];
  const maxTrend = Math.max(1, ...trend.map((p) => p.revenue));
  const inStock = Math.max(0, (data?.totalProducts ?? 0) - (data?.lowStockCount ?? 0) - (data?.outOfStockCount ?? 0));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-text-primary">Welcome{user ? `, ${user.name}` : ""}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Revenue today" value={formatCurrency(data?.todayRevenue ?? 0, currency)} tone="text-primary" />
        <StatTile label="Sales today" value={String(data?.todaySalesCount ?? 0)} />
        <StatTile label="Products" value={String(data?.totalProducts ?? 0)} />
        <StatTile label="Low stock" value={String(data?.lowStockCount ?? 0)} tone="text-accent-amber" />
        <StatTile label="Out of stock" value={String(data?.outOfStockCount ?? 0)} tone="text-error" />
        <StatTile label="Expiring soon" value={String(data?.expiringSoonCount ?? 0)} tone="text-accent-orange" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-bold text-text-primary">Revenue · last 7 days</div>
          <div className="flex h-44 items-end gap-2">
            {trend.map((p) => (
              <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(2, (p.revenue / maxTrend) * 140)}px` }}
                  title={formatCurrency(p.revenue, currency)}
                />
                <div className="text-[10px] text-text-secondary">{p.date.slice(5, 10)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-4 text-sm font-bold text-text-primary">Stock health</div>
          <div className="space-y-3">
            <HealthRow label="In stock" value={inStock} cls="bg-success" />
            <HealthRow label="Low stock" value={data?.lowStockCount ?? 0} cls="bg-accent-amber" />
            <HealthRow label="Out of stock" value={data?.outOfStockCount ?? 0} cls="bg-error" />
          </div>
        </div>
      </div>

      {data?.recentSales?.length ? (
        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-5 py-3 text-sm font-bold text-text-primary">Recent sales</div>
          <table className="w-full text-sm">
            <tbody>
              {data.recentSales.slice(0, 8).map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2.5 text-text-secondary">{new Date(s.timestamp).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</td>
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
