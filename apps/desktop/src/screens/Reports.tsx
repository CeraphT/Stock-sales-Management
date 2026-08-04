import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StatCard } from "@/components/StatCard";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

type Range = "7d" | "30d" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

function fromForRange(range: Range): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (range === "7d" ? 6 : 29));
  return d.toISOString();
}

export function Reports() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const [range, setRange] = useState<Range>("7d");
  const from = fromForRange(range);

  const { data: summary } = useQuery({
    queryKey: ["report-summary", companyId, range],
    queryFn: () => reportsApi.salesSummary(companyId, { from }),
  });
  const { data: top = [] } = useQuery({
    queryKey: ["report-top", companyId, range],
    queryFn: () => reportsApi.topProducts(companyId, { from, limit: 10 }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
              range === r.key ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-surface"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard index={0} color="primary" icon="💵" label="Revenue" value={formatCurrency(summary?.totalRevenue ?? 0, currency)} />
        <StatCard index={1} color="neutral" icon="🏷️" label="Cost" value={formatCurrency(summary?.totalCost ?? 0, currency)} />
        <StatCard index={2} color="green" icon="📈" label="Profit" value={formatCurrency(summary?.totalProfit ?? 0, currency)} />
        <StatCard index={3} color="blue" icon="🧾" label="Sales" value={String(summary?.totalSalesCount ?? 0)} />
        <StatCard index={4} color="orange" icon="🧮" label="Avg sale" value={formatCurrency(summary?.averageSaleValue ?? 0, currency)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">Daily breakdown</div>
          <table className="w-full text-sm">
            <tbody>
              {(summary?.dailyBreakdown ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-secondary">No sales in this period.</td>
                </tr>
              ) : (
                summary!.dailyBreakdown.map((d) => (
                  <tr key={d.date} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{d.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{d.salesCount} sales</td>
                    <td className="px-4 py-2 text-right font-medium text-text-primary">{formatCurrency(d.revenue, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">Top products</div>
          <table className="w-full text-sm">
            <tbody>
              {top.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-secondary">No product sales yet.</td>
                </tr>
              ) : (
                top.map((p) => (
                  <tr key={p.productId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{p.productName}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{p.quantitySold} sold</td>
                    <td className="px-4 py-2 text-right font-medium text-text-primary">{formatCurrency(p.revenue, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
