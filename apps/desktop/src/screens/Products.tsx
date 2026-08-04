import type { StockStatus } from "@stockflow/core/api/enums";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { StockBadge } from "@/components/StockBadge";
import { daysUntil, listProducts } from "@/data/products";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

export function Products() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const [q, setQ] = useState("");

  const stockFilter = params.get("stock") as StockStatus | null;
  const expiringFilter = params.get("expiring") === "1";
  const favoritesFilter = params.get("favorites") === "1";

  const { data, isLoading } = useQuery({
    queryKey: ["products", companyId],
    queryFn: () => listProducts(companyId!),
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    let items = data ?? [];
    if (stockFilter) items = items.filter((p) => p.status === stockFilter);
    if (favoritesFilter) items = items.filter((p) => p.isFavorite);
    if (expiringFilter) items = items.filter((p) => p.earliestExpiry != null && daysUntil(p.earliestExpiry) <= 30);
    const s = q.trim().toLowerCase();
    if (s) items = items.filter((p) => p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s));
    return items;
  }, [data, q, stockFilter, expiringFilter, favoritesFilter]);

  const activeFilter = stockFilter
    ? STATUS_LABEL[stockFilter]
    : expiringFilter
      ? "Expiring soon"
      : favoritesFilter
        ? "Favorites"
        : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by name or barcode…"
            className="h-10 w-72 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
          {activeFilter ? (
            <button
              onClick={() => setParams({})}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"
              style={{ backgroundColor: "rgb(var(--color-primary) / 0.12)" }}
            >
              {activeFilter}
              <span className="opacity-70">✕</span>
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">{filtered.length} products</span>
          <Button onClick={() => navigate("/products/new")}>+ New product</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Barcode</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="px-4 py-3 text-right font-semibold">Stock</th>
              <th className="px-4 py-3 font-semibold">Expiry</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  {activeFilter ? `No products matching "${activeFilter}".` : "No products yet. Sync with the server, or add one."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const days = p.earliestExpiry != null ? daysUntil(p.earliestExpiry) : null;
                const expiryTone = days == null ? "text-text-secondary" : days < 0 ? "text-error" : days <= 30 ? "text-accent-orange" : "text-text-secondary";
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/products/${p.id}/edit`)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-background/60"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-text-primary">
                        {p.isFavorite ? "★ " : ""}
                        {p.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{p.barcode ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(p.salePrice, currency)}</td>
                    <td className="px-4 py-3 text-right text-text-primary">{p.stock}</td>
                    <td className={`px-4 py-3 text-xs ${expiryTone}`}>{p.earliestExpiry ? p.earliestExpiry.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3">
                      <StockBadge status={p.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
