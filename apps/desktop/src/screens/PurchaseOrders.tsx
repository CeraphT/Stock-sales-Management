import { PurchaseOrderStatus } from "@stockflow/core/api/enums";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { formatCurrency, purchaseOrderStatusLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { PoStatusBadge } from "@/components/PoStatusBadge";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

const FILTERS: { label: string; value: PurchaseOrderStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Pending", value: PurchaseOrderStatus.Pending },
  { label: "Partial", value: PurchaseOrderStatus.PartiallyReceived },
  { label: "Received", value: PurchaseOrderStatus.Received },
  { label: "Cancelled", value: PurchaseOrderStatus.Cancelled },
];

export function PurchaseOrders() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const [status, setStatus] = useState<PurchaseOrderStatus | undefined>(undefined);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId, status, from, to],
    queryFn: () => purchaseOrdersApi.list(companyId, { status, from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setStatus(f.value)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                  status === f.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-surface"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <DateRange
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        </div>
        <Button onClick={() => navigate("/purchase-orders/new")}>+ New order</Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Supplier</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 text-right font-semibold">Lines</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
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
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  No purchase orders.
                </td>
              </tr>
            ) : (
              data.map((po) => (
                <tr
                  key={po.id}
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-background/60"
                >
                  <td className="px-4 py-3 text-text-primary">{new Date(po.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-text-primary">{po.supplierName}</td>
                  <td className="px-4 py-3 text-text-secondary">{po.locationName}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{po.lineCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">{formatCurrency(po.totalCost, currency)}</td>
                  <td className="px-4 py-3">
                    <PoStatusBadge status={po.status} label={purchaseOrderStatusLabel(po.status)} />
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
