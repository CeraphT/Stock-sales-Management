import { formatCurrency } from "@stockflow/core/format";
import { getDashboardStats } from "@stockflow/core/local/dashboardQueries";
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

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const currency = useCurrency();

  const { data } = useQuery({
    queryKey: ["dashboard", companyId, locationId],
    queryFn: () => getDashboardStats(companyId!, locationId!),
    enabled: !!companyId && !!locationId,
  });

  const trend = data?.revenueTrend ?? [];
  const maxTrend = Math.max(1, ...trend.map((p) => p.total));
  const health = data?.stockHealth ?? { inStock: 0, lowStock: 0, outOfStock: 0 };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-text-primary">Welcome{user ? `, ${user.name}` : ""}</h2>
        <p className="text-sm text-text-secondary">{locationName ? `Operating at ${locationName}` : " "}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Revenue today" value={formatCurrency(data?.todaySalesTotal ?? 0, currency)} tone="text-primary" />
        <StatTile label="Sales today" value={String(data?.todaySalesCount ?? 0)} />
        <StatTile label="Low / out of stock" value={String(data?.lowStockCount ?? 0)} tone="text-accent-amber" />
        <StatTile label="Held sales" value={String(data?.heldSalesCount ?? 0)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-bold text-text-primary">Revenue · last 7 days</div>
          <div className="flex h-40 items-end gap-2">
            {trend.map((p) => (
              <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(2, (p.total / maxTrend) * 130)}px` }}
                  title={formatCurrency(p.total, currency)}
                />
                <div className="text-[10px] text-text-secondary">{p.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-4 text-sm font-bold text-text-primary">Stock health</div>
          <div className="space-y-3">
            <HealthRow label="In stock" value={health.inStock} cls="bg-success" />
            <HealthRow label="Low stock" value={health.lowStock} cls="bg-accent-amber" />
            <HealthRow label="Out of stock" value={health.outOfStock} cls="bg-error" />
          </div>
        </div>
      </div>
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
