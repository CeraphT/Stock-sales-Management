import type { CartLine } from "@stockflow/core/cart/store";
import { useCartStore } from "@stockflow/core/cart/store";
import { formatCurrency } from "@stockflow/core/format";
import { localSalesService } from "@stockflow/core/local/salesService";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { IconButton } from "@/components/IconButton";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/lib/useCompany";

export function HeldSales() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCurrency();
  const t = useT();

  const cartLines = useCartStore((s) => s.lines);
  const loadLines = useCartStore((s) => s.loadLines);

  const { data = [], isLoading } = useQuery({
    queryKey: ["held-sales", companyId, locationId],
    queryFn: () => localSalesService.getHeldSales(companyId!, locationId ?? null),
    enabled: !!companyId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["held-sales", companyId, locationId] });

  async function resume(saleId: string) {
    if (!companyId) return;
    if (cartLines.length > 0) {
      toast("Clear or complete the current cart before resuming a held sale.", "error");
      return;
    }
    try {
      const detail = await localSalesService.getSaleDetail(companyId, saleId);
      const lines: CartLine[] = detail.productLines.map((line) => ({
        key: `${line.productId}:${line.packagingLevelId ?? "base"}`,
        productId: line.productId,
        productName: line.productName,
        packagingLevelId: line.packagingLevelId,
        packagingLevelName: line.packagingLevelName,
        unitPrice: line.unitPrice,
        quantity: Math.round(line.quantityInBaseUnits / line.unitsPerPackagingLevel),
      }));
      loadLines(lines, null, null);
      await localSalesService.deleteHeldSale(companyId, saleId);
      navigate("/pos");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not resume the sale.", "error");
    }
  }

  async function remove(saleId: string) {
    if (!companyId) return;
    if (!(await confirmDialog({ message: t("Delete this held sale? This cannot be undone."), danger: true, confirmLabel: t("Delete") }))) return;
    try {
      await localSalesService.deleteHeldSale(companyId, saleId);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the sale.", "error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} {data.length === 1 ? t("held sale") : t("held sales")}</span>
        <button onClick={() => navigate("/pos")} className="text-sm font-semibold text-primary">
          {t("← Back to POS")}
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">{t("No held sales. Park a cart from the POS with “Hold sale”.")}</div>
        ) : (
          data.map((h) => (
            <div key={h.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  {h.itemCount} {h.itemCount === 1 ? t("item") : t("items")} · {formatCurrency(h.total, currency)}
                </div>
                <div className="text-xs text-text-secondary">
                  {new Date(h.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {h.cashierName ? ` · ${h.cashierName}` : ""}
                </div>
              </div>
              <IconButton icon="▶️" label={t("Resume sale")} tone="primary" onClick={() => resume(h.id)} />
              <IconButton icon="🗑️" label={t("Delete held sale")} tone="danger" onClick={() => remove(h.id)} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
