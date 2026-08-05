import { ApiError } from "@stockflow/core/api/client";
import { salesApi } from "@stockflow/core/api/endpoints/sales";
import { SaleStatus, UserRole } from "@stockflow/core/api/enums";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { printReceipt } from "@/lib/receipt";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCompany, useCurrency } from "@/lib/useCompany";

const STATUS_LABEL: Record<SaleStatus, { text: string; cls: string }> = {
  [SaleStatus.Completed]: { text: "Completed", cls: "bg-success/15 text-success" },
  [SaleStatus.Held]: { text: "Held", cls: "bg-accent-amber/15 text-accent-amber" },
  [SaleStatus.Cancelled]: { text: "Cancelled", cls: "bg-text-secondary/15 text-text-secondary" },
  [SaleStatus.Refunded]: { text: "Refunded", cls: "bg-error/15 text-error" },
};

export function SaleDetail() {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const role = useAuthStore((s) => s.user?.role);
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();
  const [refunding, setRefunding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", companyId, saleId],
    queryFn: () => salesApi.detail(companyId!, saleId!),
    enabled: !!companyId && !!saleId,
  });

  useSetBreadcrumb([
    { label: "Sales history", to: "/sales" },
    { label: sale ? `${t("Sale")} · ${new Date(sale.timestamp).toLocaleDateString()}` : t("Sale") },
  ]);

  async function refund() {
    if (!companyId || !saleId || refunding) return;
    if (!(await confirmDialog({ title: t("Refund sale"), message: t("Refund this sale? Stock and payments will be reversed."), danger: true, confirmLabel: t("Refund sale") }))) return;
    setRefunding(true);
    setMsg(null);
    try {
      await salesApi.refund(companyId, saleId);
      setMsg("Sale refunded.");
      await queryClient.invalidateQueries();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Refund failed.");
    } finally {
      setRefunding(false);
    }
  }

  if (isLoading || !sale) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackButton />
        <div className="mt-4 rounded-card border border-border bg-surface p-10 text-center text-text-secondary">
          {isLoading ? t("Loading…") : t("Sale not found.")}
        </div>
      </div>
    );
  }

  const status = STATUS_LABEL[sale.status];
  const canRefund = sale.status === SaleStatus.Completed && (role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-3">
          <button
            onClick={() => company && printReceipt(sale, company)}
            className="text-sm font-semibold text-primary hover:brightness-110"
          >
            🖨 {t("Print receipt")}
          </button>
          <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{t(status.text)}</span>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm text-text-secondary">{sale.locationName}</div>
            <div className="text-xs text-text-secondary">
              {new Date(sale.timestamp).toLocaleString()} · {sale.cashierName}
            </div>
          </div>
          <div className="text-2xl font-extrabold text-text-primary">{formatCurrency(sale.total, currency)}</div>
        </div>

        {sale.customerName ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm">
            <span className="font-semibold text-text-primary">👤 {sale.customerName}</span>
            {sale.customerPhone ? (
              <a href={`tel:${sale.customerPhone}`} className="font-semibold text-primary">📞 {sale.customerPhone}</a>
            ) : (
              <span className="text-text-secondary">{t("no phone on file")}</span>
            )}
          </div>
        ) : null}

        <div className="my-5 border-t border-dashed border-border" />

        <table className="w-full text-sm">
          <tbody>
            {sale.productLines.map((l, i) => (
              <tr key={`p${i}`} className="border-b border-border/50 last:border-0">
                <td className="py-2">
                  <div className="font-medium text-text-primary">{l.productName}</div>
                  <div className="text-xs text-text-secondary">
                    {l.quantityInBaseUnits} × {formatCurrency(l.unitPrice, currency)}
                    {l.batchNumber ? ` · batch ${l.batchNumber}` : ""}
                  </div>
                </td>
                <td className="py-2 text-right font-medium text-text-primary">{formatCurrency(l.lineTotal, currency)}</td>
              </tr>
            ))}
            {sale.serviceLines.map((l, i) => (
              <tr key={`s${i}`} className="border-b border-border/50 last:border-0">
                <td className="py-2">
                  <div className="font-medium text-text-primary">{l.serviceName}</div>
                  <div className="text-xs text-text-secondary">
                    {l.quantity} × {formatCurrency(l.billedPrice, currency)}
                  </div>
                </td>
                <td className="py-2 text-right font-medium text-text-primary">{formatCurrency(l.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-4 border-t border-border" />

        <div className="space-y-1.5 text-sm">
          <Row label={t("Total")} value={formatCurrency(sale.total, currency)} bold />
          <Row label={t("Payment")} value={t(paymentMethodLabel(sale.paymentMethod))} />
          {sale.paymentSplits.map((s, i) => (
            <Row key={i} label={`· ${t(paymentMethodLabel(s.method))}`} value={formatCurrency(s.amount, currency)} muted />
          ))}
          {sale.amountTendered != null ? <Row label={t("Tendered")} value={formatCurrency(sale.amountTendered, currency)} muted /> : null}
          {sale.changeDue != null ? <Row label={t("Change")} value={formatCurrency(sale.changeDue, currency)} muted /> : null}
        </div>
      </div>

      {msg ? <div className="mt-4 text-sm font-medium text-text-primary">{msg}</div> : null}

      {canRefund ? (
        <div className="mt-4 flex justify-end">
          <Button variant="danger" onClick={refund} loading={refunding}>
            {t("Refund sale")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-text-secondary" : "text-text-primary"}>{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${muted ? "text-text-secondary" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
