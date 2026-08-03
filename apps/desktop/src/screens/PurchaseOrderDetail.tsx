import { ApiError } from "@stockflow/core/api/client";
import { PurchaseOrderStatus } from "@stockflow/core/api/enums";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { formatCurrency, purchaseOrderStatusLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { PoStatusBadge } from "@/components/PoStatusBadge";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";
import { runSync } from "@/lib/sync/runSync";

export function PurchaseOrderDetail() {
  const { poId } = useParams();
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", companyId, poId],
    queryFn: () => purchaseOrdersApi.get(companyId, poId!),
    enabled: !!poId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["purchase-order", companyId, poId] });

  function startReceive(lineId: string, remaining: number) {
    setReceivingId(lineId);
    setQty(String(remaining));
    setBatch("");
    setExpiry("");
    setCost("");
    setError(null);
  }

  async function receive(lineId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await purchaseOrdersApi.receiveLine(companyId, poId!, lineId, {
        quantityReceivedNow: Number(qty) || 0,
        batchNumber: batch.trim(),
        expiryDate: expiry ? new Date(expiry).toISOString() : null,
        actualUnitCost: cost.trim() ? Number(cost) : null,
      });
      setReceivingId(null);
      await runSync(); // pulls the new batch/stock into the local mirror
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not receive this line.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this purchase order?")) return;
    try {
      await purchaseOrdersApi.cancel(companyId, poId!);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel.");
    }
  }

  if (isLoading || !po) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackButton />
        <div className="mt-4 rounded-card border border-border bg-surface p-10 text-center text-text-secondary">
          {isLoading ? "Loading…" : "Not found."}
        </div>
      </div>
    );
  }

  const canReceive = po.status !== PurchaseOrderStatus.Received && po.status !== PurchaseOrderStatus.Cancelled;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <PoStatusBadge status={po.status} label={purchaseOrderStatusLabel(po.status)} />
      </div>

      <div className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-lg font-bold text-text-primary">{po.supplierName}</div>
            <div className="text-xs text-text-secondary">
              {po.locationName} · {new Date(po.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        {po.notes ? <p className="mt-2 text-sm text-text-secondary">{po.notes}</p> : null}

        <div className="my-4 border-t border-border" />

        <div className="space-y-2">
          {po.lines.map((l) => {
            const remaining = l.quantityOrdered - l.quantityReceived;
            return (
              <div key={l.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">{l.productName}</div>
                    <div className="text-xs text-text-secondary">
                      {l.quantityReceived}/{l.quantityOrdered} received · {formatCurrency(l.unitCost, currency)} each
                    </div>
                  </div>
                  {canReceive && remaining > 0 && receivingId !== l.id ? (
                    <button onClick={() => startReceive(l.id, remaining)} className="text-sm font-semibold text-primary">
                      Receive
                    </button>
                  ) : null}
                </div>

                {receivingId === l.id ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                    <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" placeholder="Qty received" className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch number" className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={expiry} onChange={(e) => setExpiry(e.target.value)} type="date" className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder="Actual unit cost" className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <div className="col-span-2 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setReceivingId(null)}>
                        Cancel
                      </Button>
                      <Button onClick={() => receive(l.id)} loading={busy} disabled={!batch.trim() || !expiry || Number(qty) <= 0}>
                        Confirm receive
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-error">{error}</p> : null}

        {po.status === PurchaseOrderStatus.Pending ? (
          <div className="mt-4 flex justify-end">
            <Button variant="danger" onClick={cancel}>
              Cancel order
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
