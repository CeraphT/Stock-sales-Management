import { PurchaseOrderStatus } from "@stockflow/core/api/enums";
import { purchaseOrdersApi } from "@stockflow/core/api/endpoints/purchaseOrders";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import { formatCurrency, purchaseOrderStatusLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { IconButton } from "@/components/IconButton";
import { PoStatusBadge } from "@/components/PoStatusBadge";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

/** Whole days since an ISO timestamp. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** An order is "overdue" if it's still awaiting stock after 30+ days. */
function isOverdue(status: PurchaseOrderStatus, createdAt: string): boolean {
  const open = status === PurchaseOrderStatus.Pending || status === PurchaseOrderStatus.PartiallyReceived;
  return open && daysSince(createdAt) > 30;
}

interface SupplierContact {
  name: string;
  phone: string | null;
  email: string | null;
}

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
  const t = useT();
  const [status, setStatus] = useState<PurchaseOrderStatus | undefined>(undefined);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [contact, setContact] = useState<SupplierContact | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId, status, from, to],
    queryFn: () => purchaseOrdersApi.list(companyId, { status, from: from || undefined, to: to || undefined }),
  });
  // Suppliers, to resolve a PO's supplier contact by name (the summary has no id).
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers", companyId], queryFn: () => suppliersApi.list(companyId) });
  const supplierByName = useMemo(() => {
    const m = new Map<string, SupplierContact>();
    for (const s of suppliers) m.set(s.name, { name: s.name, phone: s.contactPhone, email: s.contactEmail });
    return m;
  }, [suppliers]);

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
                {t(f.label)}
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
        <Button onClick={() => navigate("/purchase-orders/new")}>{t("+ New order")}</Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Created")}</th>
              <th className="px-4 py-3 font-semibold">{t("Supplier")}</th>
              <th className="px-4 py-3 font-semibold">{t("Location")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Lines")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Total")}</th>
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
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  {t("No purchase orders.")}
                </td>
              </tr>
            ) : (
              data.map((po) => {
                const overdue = isOverdue(po.status, po.createdAt);
                return (
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
                      <div className="flex items-center gap-2">
                        <PoStatusBadge status={po.status} label={purchaseOrderStatusLabel(po.status)} />
                        {overdue ? (
                          <span
                            title={`${t("Awaiting stock for")} ${daysSince(po.createdAt)} ${t("days")}`}
                            className="rounded-lg bg-error/15 px-2 py-0.5 text-xs font-bold text-error"
                          >
                            ⏰ {daysSince(po.createdAt)}d
                          </span>
                        ) : null}
                        {/* Contact button on every PO, not only overdue ones. */}
                        <IconButton
                          icon="📞"
                          label={t("Contact supplier")}
                          tone={overdue ? "primary" : "neutral"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setContact(supplierByName.get(po.supplierName) ?? { name: po.supplierName, phone: null, email: null });
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {contact ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setContact(null)}
        >
          <div
            className="card-in w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Supplier contact")}</div>
            <div className="mb-4 text-lg font-bold text-text-primary">{contact.name}</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-16 text-text-secondary">{t("Phone")}</span>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} className="font-semibold text-primary">{contact.phone}</a>
                ) : (
                  <span className="text-text-secondary">{t("— not on file —")}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-text-secondary">{t("Email")}</span>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="font-semibold text-primary">{contact.email}</a>
                ) : (
                  <span className="text-text-secondary">{t("— not on file —")}</span>
                )}
              </div>
            </div>
            {!contact.phone && !contact.email ? (
              <p className="mt-3 text-xs text-text-secondary">{t("No contact details recorded. Add them on the Suppliers screen.")}</p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={() => setContact(null)}>{t("Close")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
