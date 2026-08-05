import { customersApi } from "@stockflow/core/api/endpoints/customers";
import type { CustomerResponse } from "@stockflow/core/api/types/customers";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCompany, useCurrency } from "@/lib/useCompany";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

type Filter = "all" | "owes" | "credit";

function printReport(rows: CustomerResponse[], companyName: string, currency: string, note: string): void {
  const body = rows
    .map(
      (c) =>
        `<tr><td>${esc(c.name)}</td><td>${esc(c.phone ?? "—")}</td>` +
        `<td class="r">${esc(formatCurrency(c.creditBalance, currency))}</td>` +
        `<td class="r">${esc(formatCurrency(c.loyaltyStoreCreditBalance, currency))}</td>` +
        `<td class="r">${c.rewardsGranted}</td></tr>`,
    )
    .join("");
  const owed = rows.reduce((s, c) => s + c.creditBalance, 0);
  const credit = rows.reduce((s, c) => s + c.loyaltyStoreCreditBalance, 0);
  const rewards = rows.reduce((s, c) => s + c.rewardsGranted, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Customer credits</title><style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 2px}.n{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:10px;text-transform:uppercase;color:#666}
    td.r,th.r{text-align:right}tfoot td{border-top:2px solid #111;font-weight:700}@media print{body{margin:0}}</style></head><body>
    <h1>${esc(companyName)} — Customer credits</h1><div class="n">${esc(note)}</div>
    <table><thead><tr><th>Customer</th><th>Phone</th><th class="r">Owes (credit sales)</th><th class="r">Store credit</th><th class="r">Rewards earned</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td colspan="2">Total</td><td class="r">${esc(formatCurrency(owed, currency))}</td><td class="r">${esc(formatCurrency(credit, currency))}</td><td class="r">${rewards}</td></tr></tfoot></table></body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow!.focus();
  window.setTimeout(() => {
    iframe.contentWindow!.print();
    window.setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}

export function CustomerCredits() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", companyId],
    queryFn: () => customersApi.list(companyId),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => (q ? c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) : true))
      .filter((c) =>
        filter === "owes" ? c.creditBalance > 0 : filter === "credit" ? c.loyaltyStoreCreditBalance > 0 : true,
      )
      .sort((a, b) => b.creditBalance - a.creditBalance || b.loyaltyStoreCreditBalance - a.loyaltyStoreCreditBalance);
  }, [customers, search, filter]);

  const totalOwed = customers.reduce((s, c) => s + c.creditBalance, 0);
  const totalCredit = customers.reduce((s, c) => s + c.loyaltyStoreCreditBalance, 0);
  const owingCount = customers.filter((c) => c.creditBalance > 0).length;
  const totalRewards = customers.reduce((s, c) => s + c.rewardsGranted, 0);

  const note = `${rows.length} ${t("customers")} · ${new Date().toLocaleDateString()}`;

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: t("All") },
    { value: "owes", label: t("Owes money") },
    { value: "credit", label: t("Has store credit") },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-text-primary">{t("Customer credits")}</h2>
        <Button variant="secondary" onClick={() => printReport(rows, company?.name ?? "", currency, note)} disabled={rows.length === 0}>
          🖨 {t("Print")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard index={0} color="red" icon="🧾" label={t("Total owed")} value={formatCurrency(totalOwed, currency)} hint={`${owingCount} ${t("customers")}`} />
        <StatCard index={1} color="primary" icon="💳" label={t("Store credit outstanding")} value={formatCurrency(totalCredit, currency)} />
        <StatCard index={2} color="amber" icon="🎁" label={t("Rewards earned")} value={String(totalRewards)} />
        <StatCard index={3} color="blue" icon="👥" label={t("Customers")} value={String(customers.length)} to="/customers" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by name or phone")}
          className="h-10 flex-1 min-w-[200px] rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                filter === f.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-background"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Customer")}</th>
              <th className="px-4 py-3 font-semibold">{t("Phone")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Owes")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Store credit")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Rewards")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  {t("No customers match.")}
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-background/50">
                  <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.phone ?? "—"}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${c.creditBalance > 0 ? "text-error" : "text-text-secondary"}`}>
                    {formatCurrency(c.creditBalance, currency)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${c.loyaltyStoreCreditBalance > 0 ? "text-success" : "text-text-secondary"}`}>
                    {formatCurrency(c.loyaltyStoreCreditBalance, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">{c.rewardsGranted > 0 ? `🎁 ${c.rewardsGranted}` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border font-bold text-text-primary">
                <td className="px-4 py-3" colSpan={2}>
                  {t("Total")}
                </td>
                <td className="px-4 py-3 text-right text-error">{formatCurrency(rows.reduce((s, c) => s + c.creditBalance, 0), currency)}</td>
                <td className="px-4 py-3 text-right text-success">{formatCurrency(rows.reduce((s, c) => s + c.loyaltyStoreCreditBalance, 0), currency)}</td>
                <td className="px-4 py-3 text-right">{rows.reduce((s, c) => s + c.rewardsGranted, 0)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
