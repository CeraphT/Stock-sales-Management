import { ApiError } from "@stockflow/core/api/client";
import { customersApi } from "@stockflow/core/api/endpoints/customers";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/lib/useCompany";

export function Customers() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<{ name: string; phone: string; isBusiness: boolean; taxId: string } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["customers", companyId, search],
    queryFn: () => customersApi.list(companyId, search || undefined),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const createM = useMutation({
    mutationFn: (v: { name: string; phone: string; isBusiness: boolean; taxId: string }) =>
      customersApi.create(companyId, {
        name: v.name.trim(),
        phone: v.phone.trim() || null,
        isBusiness: v.isBusiness,
        taxId: v.isBusiness ? v.taxId.trim() || null : null,
      }),
    onSuccess: () => {
      setAdding(null);
      invalidate();
    },
    onError,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by name or phone…")}
          className="h-10 w-72 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        {!adding ? <Button onClick={() => setAdding({ name: "", phone: "", isBusiness: false, taxId: "" })}>{t("+ New customer")}</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">{t("New customer")}</div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("Name")} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            <TextField label={t("Phone")} value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={adding.isBusiness} onChange={(e) => setAdding({ ...adding, isBusiness: e.target.checked })} className="h-4 w-4" />
            <span className="text-sm font-semibold text-text-primary">🏢 {t("Business customer (VAT added on top)")}</span>
          </label>
          {adding.isBusiness ? (
            <TextField label={t("Taxpayer number (NIU)")} value={adding.taxId} onChange={(e) => setAdding({ ...adding, taxId: e.target.value })} />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim()}>
              {t("Save")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Name")}</th>
              <th className="px-4 py-3 font-semibold">{t("Phone")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Credit")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Store credit")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Rewards")}</th>
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
                  {t("No customers yet.")}
                </td>
              </tr>
            ) : (
              data.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    <span className="flex items-center gap-2">
                      {c.name}
                      {c.isBusiness ? (
                        <span className="rounded-md bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-blue" title={c.taxId ? `NIU: ${c.taxId}` : undefined}>
                          🏢 {t("Pro")}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.phone ?? "—"}</td>
                  <td className={`px-4 py-3 text-right ${c.creditBalance > 0 ? "text-error" : "text-text-primary"}`}>
                    {formatCurrency(c.creditBalance, currency)}
                  </td>
                  <td className={`px-4 py-3 text-right ${c.loyaltyStoreCreditBalance > 0 ? "text-success" : "text-text-primary"}`}>
                    {formatCurrency(c.loyaltyStoreCreditBalance, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {c.rewardsGranted > 0 ? `🎁 ${c.rewardsGranted}` : "—"}
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
