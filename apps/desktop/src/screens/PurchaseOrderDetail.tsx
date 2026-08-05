import { ApiError } from "@stockflow/core/api/client";
import { PurchaseOrderStatus } from "@stockflow/core/api/enums";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { formatCurrency, purchaseOrderStatusLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { PoStatusBadge } from "@/components/PoStatusBadge";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { printColoredReport } from "@/lib/reportPdf";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCompany, useCurrency } from "@/lib/useCompany";
import { runSync } from "@/lib/sync/runSync";

/** Whole days since an ISO timestamp. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function PurchaseOrderDetail() {
  const { poId } = useParams();
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();

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

  useSetBreadcrumb([
    { label: "Purchase orders", to: "/purchase-orders" },
    { label: po?.supplierName ?? "Order" },
  ]);

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
    if (!(await confirmDialog({ title: t("Cancel order"), message: t("Cancel this purchase order?"), danger: true, confirmLabel: t("Cancel order"), cancelLabel: t("Keep") }))) return;
    try {
      await purchaseOrdersApi.cancel(companyId, poId!);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel.");
    }
  }

  async function cancelLine(lineId: string, productName: string) {
    if (!(await confirmDialog({ message: `${t("Stop expecting the outstanding")} "${productName}"? ${t("Any stock already received is kept.")}`, danger: true, confirmLabel: t("Cancel outstanding"), cancelLabel: t("Keep") }))) return;
    try {
      await purchaseOrdersApi.cancelLineRemaining(companyId, poId!, lineId);
      toast(`Outstanding "${productName}" cancelled.`, "success");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel the line.");
    }
  }

  function printPo() {
    if (!po) return;
    const total = po.lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0);
    printColoredReport({
      companyName: company?.name ?? "",
      logoUrl: company?.logoUrl,
        taxId: company?.taxId,
      contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
      title: `${t("Purchase order")} · ${po.supplierName}`,
      subtitle: `${po.locationName} · ${new Date(po.createdAt).toLocaleDateString()} · ${purchaseOrderStatusLabel(po.status)}`,
      meta: [
        { label: t("Supplier"), value: po.supplierName },
        { label: t("Lines"), value: String(po.lines.length) },
        { label: t("Total"), value: formatCurrency(total, currency) },
      ],
      columns: [
        { header: t("Product") },
        { header: t("Ordered"), align: "right" },
        { header: t("Received"), align: "right" },
        { header: t("Unit cost"), align: "right" },
        { header: t("Line total"), align: "right" },
      ],
      rows: po.lines.map((l) => [
        l.productName,
        String(l.quantityOrdered),
        String(l.quantityReceived),
        formatCurrency(l.unitCost, currency),
        formatCurrency(l.quantityOrdered * l.unitCost, currency),
      ]),
      totals: [t("Total"), null, null, null, formatCurrency(total, currency)],
    });
  }

  if (isLoading || !po) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackButton />
        <div className="mt-4 rounded-card border border-border bg-surface p-10 text-center text-text-secondary">
          {isLoading ? t("Loading…") : t("Not found.")}
        </div>
      </div>
    );
  }

  const canReceive = po.status !== PurchaseOrderStatus.Received && po.status !== PurchaseOrderStatus.Cancelled;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={printPo}>
            🖨 {t("Print / share PDF")}
          </Button>
          <PoStatusBadge status={po.status} label={purchaseOrderStatusLabel(po.status)} />
        </div>
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
            const pendingDays = daysSince(po.createdAt);
            return (
              <div key={l.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{l.productName}</div>
                    <div className="text-xs text-text-secondary">
                      {l.quantityReceived}/{l.quantityOrdered} {t("received")} · {formatCurrency(l.unitCost, currency)} {t("each")}
                    </div>
                    {remaining > 0 ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent-amber/15 px-2 py-0.5 text-xs font-semibold text-accent-amber">
                        {remaining} {t("outstanding")} · {t("pending")} {pendingDays}d
                      </div>
                    ) : (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                        ✓ {t("fully received")}
                      </div>
                    )}
                  </div>
                  {canReceive && remaining > 0 && receivingId !== l.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startReceive(l.id, remaining)} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10">
                        {t("Receive")}
                      </button>
                      <IconButton icon="🚫" label={t("Cancel outstanding")} tone="danger" onClick={() => cancelLine(l.id, l.productName)} />
                    </div>
                  ) : null}
                </div>

                {receivingId === l.id ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                    <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" placeholder={t("Qty received")} className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={t("Batch number")} className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={expiry} onChange={(e) => setExpiry(e.target.value)} type="date" className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder={t("Actual unit cost")} className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                    <div className="col-span-2 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setReceivingId(null)}>
                        {t("Cancel")}
                      </Button>
                      <Button onClick={() => receive(l.id)} loading={busy} disabled={!batch.trim() || !expiry || Number(qty) <= 0}>
                        {t("Confirm receive")}
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
              {t("Cancel order")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
