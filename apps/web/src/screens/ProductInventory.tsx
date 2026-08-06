import { productsApi } from "@stockflow/core/api/endpoints/products";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function ProductInventory() {
  const { productId } = useParams();
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();

  const { data: product } = useQuery({
    queryKey: ["product", companyId, productId],
    queryFn: () => productsApi.get(companyId, productId!),
    enabled: !!productId,
  });
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches", companyId, productId],
    queryFn: () => productsApi.batches(companyId, productId!),
    enabled: !!productId,
  });

  useSetBreadcrumb([
    { label: "Products", to: "/products" },
    { label: product?.name ?? "Inventory" },
  ]);

  const totalStock = batches.reduce((s, b) => s + b.quantityInBaseUnits, 0);
  const stockValue = batches.reduce((s, b) => s + b.quantityInBaseUnits * b.purchasePricePerBaseUnit, 0);
  const levels = product?.packagingLevels ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">{product?.name ?? ""}</h2>
        <span className="w-12" />
      </div>

      {/* Totals + packaging breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("In stock")}</div>
          <div className="mt-1 text-2xl font-extrabold text-text-primary tabular-nums">
            {totalStock} <span className="text-sm font-medium text-text-secondary">{t("units")}</span>
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Stock value (cost)")}</div>
          <div className="mt-1 text-2xl font-extrabold text-text-primary tabular-nums">{formatCurrency(stockValue, currency)}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Batches")}</div>
          <div className="mt-1 text-2xl font-extrabold text-text-primary tabular-nums">{batches.length}</div>
        </div>
      </div>

      {/* Packaging breakdown — how the base-unit stock maps to each pack size. */}
      {levels.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 text-sm font-bold text-text-primary">📦 {t("Packaging breakdown")}</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t("Unit")}</span>
              <span className="font-semibold text-text-primary tabular-nums">{totalStock}</span>
            </div>
            {levels.map((lvl) => {
              const whole = Math.floor(totalStock / lvl.quantityInBaseUnits);
              const rem = totalStock % lvl.quantityInBaseUnits;
              return (
                <div key={lvl.id} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">
                    {lvl.unitName} <span className="text-xs">({lvl.quantityInBaseUnits} {t("units")})</span>
                  </span>
                  <span className="font-semibold text-text-primary tabular-nums">
                    {whole} {rem > 0 ? <span className="font-normal text-text-secondary">+ {rem} {t("units")}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Batch detail */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="border-b border-border px-5 py-3 text-sm font-bold text-text-primary">{t("Batches")}</div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t("No stock batches yet.")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2.5 font-semibold">{t("Batch number")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Quantity")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Expiry")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Unit cost")}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const days = b.expiryDate ? daysUntil(b.expiryDate) : null;
                const tone = days == null ? "text-text-secondary" : days < 0 ? "text-error" : days <= 30 ? "text-accent-orange" : "text-text-secondary";
                return (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-text-primary">{b.batchNumber}</td>
                    <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{b.quantityInBaseUnits}</td>
                    <td className={`px-4 py-2.5 text-xs ${tone}`}>
                      {b.expiryDate ? b.expiryDate.slice(0, 10) : "—"}
                      {days != null && days < 0 ? ` · ${t("Expired")}` : null}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(b.purchasePricePerBaseUnit, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
