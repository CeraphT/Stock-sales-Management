import { ApiError } from "@stockflow/core/api/client";
import { giftCardsApi } from "@stockflow/core/api/endpoints/giftCards";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { printColoredReport } from "@/lib/reportPdf";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCompany, useCurrency } from "@/lib/useCompany";

export function GiftCards() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();
  const [amount, setAmount] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["giftcards", companyId],
    queryFn: () => giftCardsApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["giftcards", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const issueM = useMutation({
    mutationFn: () => giftCardsApi.issue(companyId, { initialValue: Number(amount) }),
    onSuccess: () => {
      setAmount("");
      invalidate();
    },
    onError,
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => giftCardsApi.setActive(companyId, v.id, { active: v.active }),
    onSuccess: () => invalidate(),
    onError,
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => giftCardsApi.delete(companyId, id),
    onSuccess: () => {
      toast(t("Gift card deleted."), "success");
      invalidate();
    },
    onError,
  });

  async function confirmDelete(g: { id: string; code: string; initialValue: number; remainingValue: number }) {
    // A used card (redeemed against a sale) has financial history — deleting it
    // would erase that trail, so it can only be deactivated, never deleted.
    if (g.remainingValue < g.initialValue) {
      toast(t("This card has been used — deactivate it instead of deleting."), "error");
      return;
    }
    const ok = await confirmDialog({
      title: t("Delete gift card"),
      message: `${g.code} — ${t("This permanently removes it. Continue?")}`,
      danger: true,
      confirmLabel: t("Delete"),
    });
    if (ok) deleteM.mutate(g.id);
  }

  function exportPdf() {
    if (data.length === 0) {
      toast(t("No gift cards issued yet."), "info");
      return;
    }
    const outstanding = data.reduce((s, g) => s + (g.active ? g.remainingValue : 0), 0);
    printColoredReport({
      companyName: company?.name ?? "",
      logoUrl: company?.logoUrl,
        taxId: company?.taxId,
      contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
      title: t("Gift cards"),
      subtitle: new Date().toLocaleDateString(),
      meta: [
        { label: t("Cards"), value: String(data.length) },
        { label: t("Outstanding"), value: formatCurrency(outstanding, currency) },
      ],
      columns: [
        { header: t("Code") },
        { header: t("Issued") },
        { header: t("Initial"), align: "right" },
        { header: t("Remaining"), align: "right" },
        { header: t("Status") },
      ],
      rows: data.map((g) => [
        g.code,
        new Date(g.createdAt).toLocaleDateString(),
        formatCurrency(g.initialValue, currency),
        formatCurrency(g.remainingValue, currency),
        g.active ? t("Active") : t("Inactive"),
      ]),
      totals: [t("Total"), null, null, formatCurrency(outstanding, currency), null],
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Issue a gift card")}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder={t("Initial value")}
            className="h-11 w-48 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
        </label>
        <Button onClick={() => issueM.mutate()} loading={issueM.isPending} disabled={Number(amount) <= 0}>
          {t("Issue card")}
        </Button>
        <div className="flex-1" />
        <Button variant="secondary" onClick={exportPdf} disabled={data.length === 0}>
          🧾 {t("Export PDF")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Code")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Initial")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Remaining")}</th>
              <th className="px-4 py-3 font-semibold">{t("Status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  {t("Loading…")}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  {t("No gift cards issued yet.")}
                </td>
              </tr>
            ) : (
              data.map((g) => (
                <tr key={g.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono font-medium text-text-primary">{g.code}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatCurrency(g.initialValue, currency)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">{formatCurrency(g.remainingValue, currency)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${g.active ? "bg-success/15 text-success" : "bg-text-secondary/15 text-text-secondary"}`}
                    >
                      {g.active ? t("Active") : t("Inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={g.active ? "🚫" : "✅"}
                        label={g.active ? t("Deactivate") : t("Activate")}
                        tone={g.active ? "danger" : "success"}
                        onClick={() => toggleM.mutate({ id: g.id, active: !g.active })}
                      />
                      <IconButton icon="🗑" label={t("Delete")} tone="danger" onClick={() => confirmDelete(g)} />
                    </div>
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
