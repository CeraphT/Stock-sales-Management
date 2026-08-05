import { ApiError } from "@stockflow/core/api/client";
import { PurchaseOrderStatus, type StockStatus } from "@stockflow/core/api/enums";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { StockBadge } from "@/components/StockBadge";
import { daysUntil, listProducts } from "@/data/products";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useScanGun } from "@/lib/useScanGun";
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
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCurrency();
  const t = useT();
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

  const [orderingId, setOrderingId] = useState<string | null>(null);

  // One-click reorder: pull the product's supplier + cost, open a draft PO to
  // that supplier pre-filled with a line for this product, ready to adjust/send.
  async function orderFromSupplier(productId: string) {
    if (!companyId || !locationId || orderingId) return;
    setOrderingId(productId);
    try {
      const detail = await productsApi.get(companyId, productId);
      if (!detail.supplierId) {
        toast(t("This product has no supplier — add one on the product first."), "error");
        navigate(`/products/${productId}/edit`);
        return;
      }
      const line = { productId, quantityOrdered: Math.max(detail.lowStockThreshold, 1), unitCost: detail.purchasePrice };
      // Consolidate: if this supplier already has an open (Pending) order, add
      // the line to it — one PO per supplier — otherwise start a new one.
      const openPos = await purchaseOrdersApi.list(companyId, {
        supplierId: detail.supplierId,
        status: PurchaseOrderStatus.Pending,
      });
      if (openPos.length > 0) {
        await purchaseOrdersApi.addLine(companyId, openPos[0].id, line);
        toast(t("Added to the existing order for this supplier."), "success");
        navigate(`/purchase-orders/${openPos[0].id}`);
      } else {
        const po = await purchaseOrdersApi.create(companyId, {
          locationId,
          supplierId: detail.supplierId,
          notes: t("Reorder — out of stock"),
          lines: [line],
        });
        navigate(`/purchase-orders/${po.id}`);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not start the order."), "error");
    } finally {
      setOrderingId(null);
    }
  }

  // Scan a product (HID barcode/QR scanner) to jump straight to its stock
  // details — the "scan → details" flow for stock management.
  useScanGun((code) => {
    const c = code.trim();
    const hit = (data ?? []).find((p) => p.barcode === c);
    if (hit) navigate(`/products/${hit.id}/inventory`);
    else toast(`${t("No product matches code")} ${c}`, "error");
  });

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
            placeholder={t("Search products by name or barcode…")}
            className="h-10 w-72 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
          {activeFilter ? (
            <button
              onClick={() => setParams({})}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"
              style={{ backgroundColor: "rgb(var(--color-primary) / 0.12)" }}
            >
              {t(activeFilter)}
              <span className="opacity-70">✕</span>
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-text-secondary md:inline">📷 {t("Scan a product to view its details")}</span>
          <span className="text-sm text-text-secondary">{filtered.length} {t("products")}</span>
          <Button onClick={() => navigate("/products/new")}>{t("+ New product")}</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Product")}</th>
              <th className="px-4 py-3 font-semibold">{t("Barcode")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Price")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Stock")}</th>
              <th className="px-4 py-3 font-semibold">{t("Expiry")}</th>
              <th className="px-4 py-3 font-semibold">{t("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  {t("Loading…")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  {activeFilter ? `${t("No products matching")} "${t(activeFilter)}".` : t("No products yet. Sync with the server, or add one.")}
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
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">
                          {p.isFavorite ? "★ " : ""}
                          {p.name}
                        </span>
                        {p.packagingUnits.length > 0 ? (
                          <span
                            title={`${t("Sub-units")}: ${p.packagingUnits.join(", ")}`}
                            className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                          >
                            📦 {p.packagingUnits.join("/")}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{p.barcode ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(p.salePrice, currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/products/${p.id}/inventory`);
                        }}
                        title={t("View inventory")}
                        className="font-medium text-text-primary underline decoration-dotted underline-offset-2 hover:text-primary"
                      >
                        {p.stock}
                      </button>
                    </td>
                    <td className={`px-4 py-3 text-xs ${expiryTone}`}>{p.earliestExpiry ? p.earliestExpiry.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StockBadge status={p.status} />
                        {days != null && days < 0 && p.stock > 0 ? (
                          <span className="rounded-lg bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">{t("Expired")}</span>
                        ) : null}
                        {p.status === "out_of_stock" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void orderFromSupplier(p.id);
                            }}
                            disabled={orderingId === p.id}
                            title={t("Order from supplier")}
                            className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50"
                          >
                            {orderingId === p.id ? "…" : `🛒 ${t("Order")}`}
                          </button>
                        ) : null}
                      </div>
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
