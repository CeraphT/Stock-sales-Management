import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { BackButton } from "@/components/BackButton";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

const WINDOWS = [60, 90, 180] as const;

export function DeadStock() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const navigate = useNavigate();
  const t = useT();
  const [days, setDays] = useState<number>(60);

  const { data = [], isLoading } = useQuery({
    queryKey: ["dead-stock", companyId, days],
    queryFn: () => reportsApi.deadStock(companyId, { days }),
    enabled: !!companyId,
  });

  const totalValue = data.reduce((s, d) => s + d.stockValue, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">🪦 {t("Dead stock")}</h2>
        <span className="w-12" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{t("Items still in stock with no sale in the period — money tied up you could liquidate.")}</p>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${days === w ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}>
              {w}{t("d")}
            </button>
          ))}
        </div>
      </div>

      {data.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Value tied up in dead stock")}</div>
          <div className="mt-1 text-2xl font-extrabold text-error">{formatCurrency(totalValue, currency)}</div>
          <div className="text-xs text-text-secondary">{data.length} {t("item(s), no sale in")} {days}{t("d")}</div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-2.5 font-semibold">{t("Product")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Stock")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Value")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Last sold")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.productId} onClick={() => navigate(`/products/${d.productId}/inventory`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-background">
                <td className="px-4 py-2 text-text-primary">{d.productName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{d.currentStock}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-text-primary">{formatCurrency(d.stockValue, currency)}</td>
                <td className="px-3 py-2 text-right text-xs text-text-secondary">
                  {d.lastSaleDate ? `${d.lastSaleDate.slice(0, 10)} · ${d.daysSinceLastSale}${t("d ago")}` : t("never sold")}
                </td>
              </tr>
            ))}
            {!isLoading && data.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-sm text-text-secondary">{t("No dead stock — everything's moving. 🎉")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
