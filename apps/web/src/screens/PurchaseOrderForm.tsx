import { ApiError } from "@stockflow/core/api/client";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

interface Line {
  productId: string;
  productName: string;
  quantityOrdered: string;
  unitCost: string;
}

const selectCls = "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary";

export function PurchaseOrderForm() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;
  const locationId = useAuthStore((s) => s.locationId)!;
  const t = useT();

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suppliers = [], isSuccess: suppliersLoaded } = useQuery({ queryKey: ["suppliers", companyId], queryFn: () => suppliersApi.list(companyId) });

  // Dependency guardrail: a purchase order is placed with a supplier — guide the
  // user to create one first if none exist. Only after the query resolves
  // (`suppliers` is [] while loading, which would toast falsely).
  const warnedNoSuppliers = useRef(false);
  useEffect(() => {
    if (suppliersLoaded && suppliers.length === 0 && !warnedNoSuppliers.current) {
      warnedNoSuppliers.current = true;
      toast(t("You need a supplier to place an order. Add one first."), "info");
    }
  }, [suppliersLoaded, suppliers.length, t]);
  const { data: results = [] } = useQuery({
    queryKey: ["po-search", companyId, search],
    queryFn: () => productsApi.search(companyId, search),
    enabled: search.trim().length > 0,
  });

  function addProduct(productId: string, productName: string) {
    setLines((l) => (l.some((x) => x.productId === productId) ? l : [...l, { productId, productName, quantityOrdered: "1", unitCost: "" }]));
    setSearch("");
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await purchaseOrdersApi.create(companyId, {
        locationId,
        supplierId,
        notes: notes.trim() || null,
        lines: lines
          .filter((l) => Number(l.quantityOrdered) > 0)
          .map((l) => ({ productId: l.productId, quantityOrdered: Number(l.quantityOrdered), unitCost: Number(l.unitCost) || 0 })),
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
      navigate("/purchase-orders");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the order.");
    } finally {
      setBusy(false);
    }
  }

  const ready = supplierId && lines.length > 0 && lines.every((l) => Number(l.quantityOrdered) > 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">{t("New purchase order")}</h2>
        <span className="w-12" />
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Supplier")}</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectCls}>
            <option value="">{t("— select supplier —")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {suppliers.length === 0 ? (
            <button type="button" onClick={() => navigate("/suppliers")} className="mt-1 text-xs font-semibold text-primary">
              {t("+ Add a supplier first")}
            </button>
          ) : null}
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Add products")}</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search products to add…")}
            className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
          {search.trim() && results.length > 0 ? (
            <div className="mt-1 max-h-40 overflow-auto rounded-xl border border-border bg-surface">
              {results.map((p) => (
                <button
                  key={p.productId}
                  onClick={() => addProduct(p.productId, p.name)}
                  className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm text-text-primary last:border-0 hover:bg-background"
                >
                  <span className="truncate">{p.name}</span>
                  {p.packagingLevels.length > 0 ? (
                    <span
                      title={p.packagingLevels.map((l) => l.unitName).join(", ")}
                      className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                    >
                      📦 {p.packagingLevels.map((l) => l.unitName).join("/")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.productId} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-text-primary">{l.productName}</span>
                <input
                  value={l.quantityOrdered}
                  onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, quantityOrdered: e.target.value } : r)))}
                  type="number"
                  placeholder={t("Qty")}
                  className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
                <input
                  value={l.unitCost}
                  onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, unitCost: e.target.value } : r)))}
                  type="number"
                  placeholder={t("Unit cost")}
                  className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
                <button onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))} className="px-1 text-text-secondary hover:text-error">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Notes (optional)")}</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
        </label>

        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}

        <div className="flex justify-end">
          <Button onClick={submit} loading={busy} disabled={!ready}>
            {t("Create order")}
          </Button>
        </div>
      </div>
    </div>
  );
}
