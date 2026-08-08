import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { BackButton } from "@/components/BackButton";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";

const WINDOWS = [30, 90] as const;

export function DemandForecast() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const navigate = useNavigate();
  const t = useT();
  const [days, setDays] = useState<number>(30);

  const { data = [], isLoading } = useQuery({
    queryKey: ["demand-forecast", companyId, days],
    queryFn: () => reportsApi.demandForecast(companyId, { days, horizon: days }),
    enabled: !!companyId,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">📈 {t("Demand forecast")}</h2>
        <span className="w-12" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{t("Sales velocity, days of cover left, and a suggested reorder for the next period.")}</p>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${days === w ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}>
              {w}{t("d")}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-2.5 font-semibold">{t("Product")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Sold")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Per day")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Stock")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Cover")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Reorder")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Trend")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i) => {
              const urgent = i.daysOfCover != null && i.daysOfCover <= 7;
              return (
                <tr key={i.productId} onClick={() => navigate(`/products/${i.productId}/inventory`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-background">
                  <td className="px-4 py-2 text-text-primary">{i.productName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{i.unitsSold}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{i.avgDailyUnits}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{i.currentStock}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${urgent ? "text-error" : "text-text-primary"}`}>
                    {i.daysOfCover == null ? "—" : `${i.daysOfCover}${t("d")}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{i.suggestedReorder > 0 ? `+${i.suggestedReorder}` : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${i.trendPct > 0 ? "text-success" : i.trendPct < 0 ? "text-error" : "text-text-secondary"}`}>
                    {i.trendPct > 0 ? "▲" : i.trendPct < 0 ? "▼" : ""}{Math.abs(i.trendPct)}%
                  </td>
                </tr>
              );
            })}
            {!isLoading && data.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-text-secondary">{t("No sales in this period to forecast from.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-secondary">{t("Cover = days of stock left at the current rate. Reorder = suggested units to cover the next period.")}</p>
    </div>
  );
}
