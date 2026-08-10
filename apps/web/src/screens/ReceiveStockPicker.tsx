import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { StockBadge } from "@/components/StockBadge";
import { listProducts } from "@/data/products";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useScanGun } from "@/lib/useScanGun";

/** Purchasing → "Receive stock": start a stock reception by picking (or
 * scanning) the product first, instead of hunting for it in the catalog and
 * clicking its per-product "Receive" button. Reuses the existing
 * /products/:id/receive form (which already adapts to serial/measure products). */
export function ReceiveStockPicker() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const t = useT();
  const [q, setQ] = useState("");

  useSetBreadcrumb([{ label: "Receive stock" }]);

  const { data, isLoading } = useQuery({
    queryKey: ["products", companyId],
    queryFn: () => listProducts(companyId!),
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) => p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s));
  }, [data, q]);

  // Scan a product barcode to jump straight into receiving it.
  useScanGun((code) => {
    const c = code.trim();
    const hit = (data ?? []).find((p) => p.barcode === c);
    if (hit) navigate(`/products/${hit.id}/receive`);
    else toast(`${t("No product matches code")} ${c}`, "error");
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-text-primary">📥 {t("Receive stock")}</h1>
        <p className="text-sm text-text-secondary">{t("Pick the product you received a delivery for, then enter the batch, quantity or serial numbers.")}</p>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search products by name or barcode…")}
          className="h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <span className="hidden shrink-0 text-xs text-text-secondary md:inline">📷 {t("or scan")}</span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Product")}</th>
              <th className="px-4 py-3 font-semibold">{t("Barcode")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Stock")}</th>
              <th className="px-4 py-3 font-semibold">{t("Status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  {t("Loading…")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  {t("No products yet. Sync with the server, or add one.")}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}/receive`)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-background/60"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{p.stock}</td>
                  <td className="px-4 py-3">
                    <StockBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-primary">
                    📥 {t("Receive")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
