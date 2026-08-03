import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { StockBadge } from "@/components/StockBadge";
import { listProducts } from "@/data/products";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function Products() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const [q, setQ] = useState("");

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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products by name or barcode…"
          className="h-10 w-80 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <span className="text-sm text-text-secondary">{filtered.length} products</span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Barcode</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="px-4 py-3 text-right font-semibold">Stock</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  No products yet. Sync with the server, or add one.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3">
                    <span className="font-medium text-text-primary">
                      {p.isFavorite ? "★ " : ""}
                      {p.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(p.salePrice, currency)}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{p.stock}</td>
                  <td className="px-4 py-3">
                    <StockBadge status={p.status} />
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
