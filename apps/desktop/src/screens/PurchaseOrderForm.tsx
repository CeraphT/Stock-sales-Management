import { ApiError } from "@stockflow/core/api/client";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { localCatalogQueryService } from "@stockflow/core/local/catalogQueryService";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";

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

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers", companyId], queryFn: () => suppliersApi.list(companyId) });
  const { data: results = [] } = useQuery({
    queryKey: ["po-search", companyId, search],
    queryFn: () => localCatalogQueryService.searchProducts(companyId, search),
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
        <h2 className="text-lg font-bold text-text-primary">New purchase order</h2>
        <span className="w-12" />
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Supplier</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectCls}>
            <option value="">— select supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Add products</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products to add…"
            className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
          {search.trim() && results.length > 0 ? (
            <div className="mt-1 max-h-40 overflow-auto rounded-xl border border-border bg-surface">
              {results.map((p) => (
                <button
                  key={p.productId}
                  onClick={() => addProduct(p.productId, p.name)}
                  className="block w-full border-b border-border/60 px-3 py-2 text-left text-sm text-text-primary last:border-0 hover:bg-background"
                >
                  {p.name}
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
                  placeholder="Qty"
                  className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
                <input
                  value={l.unitCost}
                  onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, unitCost: e.target.value } : r)))}
                  type="number"
                  placeholder="Unit cost"
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
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
        </label>

        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}

        <div className="flex justify-end">
          <Button onClick={submit} loading={busy} disabled={!ready}>
            Create order
          </Button>
        </div>
      </div>
    </div>
  );
}
