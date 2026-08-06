import { ApiError } from "@stockflow/core/api/client";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/Button";
import { listProducts } from "@/data/products";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/lib/useCompany";

export function Archived() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();

  const { data = [], isLoading } = useQuery({
    queryKey: ["products-archived", companyId],
    queryFn: () => listProducts(companyId, false),
    enabled: !!companyId,
  });

  const restoreM = useMutation({
    mutationFn: (productId: string) => productsApi.restore(companyId, productId),
    onSuccess: async (_res, productId) => {
      const name = data.find((p) => p.id === productId)?.name;
      await runSync(); // pull the reactivated product back into the local mirror
      await queryClient.invalidateQueries();
      toast(`${name ?? t("Product")} — ${t("restored.")}`, "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t("Could not restore the product."), "error"),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-4 text-sm text-text-secondary">{t("Archived products are hidden from the catalog and the point of sale. Restore one to sell it again.")}</p>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Product")}</th>
              <th className="px-4 py-3 font-semibold">{t("Barcode")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Price")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Stock")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">{t("Loading…")}</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">{t("No archived products.")}</td>
              </tr>
            ) : (
              data.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(p.salePrice, currency)}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{p.stock}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => restoreM.mutate(p.id)} loading={restoreM.isPending}>
                      ♻️ {t("Restore")}
                    </Button>
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
