import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DateRange } from "@/components/DateRange";
import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function Reports() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState("");

  const { data: summary } = useQuery({
    queryKey: ["report-summary", companyId, from, to],
    queryFn: () => reportsApi.salesSummary(companyId, { from: from || undefined, to: to || undefined }),
  });
  const { data: top = [] } = useQuery({
    queryKey: ["report-top", companyId, from, to],
    queryFn: () => reportsApi.topProducts(companyId, { from: from || undefined, to: to || undefined, limit: 10 }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <DateRange
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard index={0} color="primary" icon="💵" label={t("Revenue")} value={formatCurrency(summary?.totalRevenue ?? 0, currency)} to={`/sales?from=${from}&to=${to}`} />
        <StatCard index={1} color="neutral" icon="🏷️" label={t("Cost")} value={formatCurrency(summary?.totalCost ?? 0, currency)} />
        <StatCard index={2} color="green" icon="📈" label={t("Profit")} value={formatCurrency(summary?.totalProfit ?? 0, currency)} />
        <StatCard index={3} color="amber" icon="🧾" label={t("VAT / TVA")} value={formatCurrency(summary?.totalTax ?? 0, currency)} hint={t("included in revenue")} />
        <StatCard index={4} color="blue" icon="🛒" label={t("Sales")} value={String(summary?.totalSalesCount ?? 0)} to={`/sales?from=${from}&to=${to}`} />
        <StatCard index={5} color="orange" icon="🧮" label={t("Avg sale")} value={formatCurrency(summary?.averageSaleValue ?? 0, currency)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">{t("Daily breakdown")}</div>
          <table className="w-full text-sm">
            <tbody>
              {(summary?.dailyBreakdown ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-secondary">{t("No sales in this period.")}</td>
                </tr>
              ) : (
                summary!.dailyBreakdown.map((d) => (
                  <tr key={d.date} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{d.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{d.salesCount} {t("sales")}</td>
                    <td className="px-4 py-2 text-right font-medium text-text-primary">{formatCurrency(d.revenue, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-bold text-text-primary">{t("Top products")}</div>
          <table className="w-full text-sm">
            <tbody>
              {top.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-secondary">{t("No product sales yet.")}</td>
                </tr>
              ) : (
                top.map((p) => (
                  <tr key={p.productId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{p.productName}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{p.quantitySold} {t("sold")}</td>
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
