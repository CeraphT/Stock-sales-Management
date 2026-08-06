import { reportsApi } from "@stockflow/core/api/endpoints/reports";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { toast } from "@/lib/toast";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { StatCard } from "@/components/StatCard";
import { useT } from "@/lib/i18n";
import { printColoredReport } from "@/lib/reportPdf";
import { useAuthStore } from "@/lib/stores";
import { useCompany, useCurrency } from "@/lib/useCompany";

export function TaxDeclaration() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState("");

  const { data: d } = useQuery({
    queryKey: ["tax-declaration", companyId, from, to],
    queryFn: () => reportsApi.taxDeclaration(companyId, { from: from || undefined, to: to || undefined }),
  });

  const fmt = (n: number) => formatCurrency(n, currency);
  const period = `${from || "…"} → ${to || t("today")}`;
  const isFlatRegime = company?.taxRegime === 1;
  const flatPeriodLabel = [t("month"), t("quarter"), t("year")][company?.flatTaxPeriod ?? 1] ?? t("quarter");
  // Accounting system: 0 = OHADA/SYSCOHADA, 1 = generic VAT, 2 = no sales tax.
  const acct = company?.accountingSystem ?? 0;
  const noTax = acct === 2;
  const showCodes = acct === 0; // only OHADA shows SYSCOHADA account codes
  const [journalBusy, setJournalBusy] = useState(false);

  async function salesJournalPdf() {
    if (journalBusy) return;
    setJournalBusy(true);
    try {
      const rows = await reportsApi.salesJournal(companyId, { from: from || undefined, to: to || undefined });
      if (rows.length === 0) {
        toast(t("No sales in this period."), "info");
        return;
      }
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      printColoredReport({
        companyName: company?.name ?? "",
        logoUrl: company?.logoUrl,
        taxId: company?.taxId,
        contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
        title: t("Sales journal"),
        subtitle: period,
        meta: [
          { label: t("Sales"), value: String(rows.length) },
          { label: t("VAT collected"), value: fmt(tVat) },
        ],
        columns: [
          { header: t("When") },
          { header: t("Ref") },
          { header: t("Customer") },
          { header: t("Payment") },
          { header: t("Base (excl. VAT)"), align: "right" },
          { header: t("VAT / TVA"), align: "right" },
          { header: t("Total"), align: "right" },
        ],
        rows: rows.map((r) => [
          new Date(r.timestamp).toLocaleDateString(),
          r.id.slice(0, 8).toUpperCase(),
          r.customerName ?? t("Walk-in"),
          t(paymentMethodLabel(r.paymentMethod)),
          fmt(r.ht),
          fmt(r.vat),
          fmt(r.ttc),
        ]),
        totals: [t("Total"), null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    } catch {
      toast(t("Could not export the report."), "error");
    } finally {
      setJournalBusy(false);
    }
  }

  function exportPdf() {
    if (!d) return;
    printColoredReport({
      companyName: company?.name ?? "",
      logoUrl: company?.logoUrl,
        taxId: company?.taxId,
      contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
      title: t("VAT declaration (TVA)"),
      subtitle: `${period} · ${t("Standard rate")} ${d.standardRatePercent}%`,
      meta: [
        { label: t("Turnover (incl. VAT)"), value: fmt(d.salesTtc) },
        { label: t("VAT due"), value: fmt(d.vatDue) },
      ],
      columns: [
        { header: "" },
        { header: t("Base (excl. VAT)"), align: "right" },
        { header: t("VAT / TVA"), align: "right" },
        { header: t("OHADA acct") },
      ],
      rows: [
        [t("VAT collected on sales"), fmt(d.salesHt), fmt(d.vatCollected), "4431"],
        [t("VAT deductible on purchases"), fmt(d.purchasesHt), fmt(d.vatDeductible), "4452"],
      ],
      totals: [t("VAT due (collected − deductible)"), null, fmt(d.vatDue), "4441"],
    });
  }

  const docBase = () => ({
    companyName: company?.name ?? "",
    logoUrl: company?.logoUrl,
    taxId: company?.taxId,
    contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
    subtitle: period,
  });

  async function purchasesJournalPdf() {
    if (journalBusy) return;
    setJournalBusy(true);
    try {
      const rows = await reportsApi.purchasesJournal(companyId, { from: from || undefined, to: to || undefined });
      if (rows.length === 0) return toast(t("No purchases in this period."), "info");
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      printColoredReport({
        ...docBase(),
        title: t("Purchases journal"),
        meta: [{ label: t("Receipts"), value: String(rows.length) }, { label: t("VAT deductible"), value: fmt(tVat) }],
        columns: [{ header: t("When") }, { header: t("Product") }, { header: t("Batch") }, { header: t("Supplier") }, { header: t("Base (excl. VAT)"), align: "right" }, { header: t("VAT / TVA"), align: "right" }, { header: t("Total"), align: "right" }],
        rows: rows.map((r) => [new Date(r.timestamp).toLocaleDateString(), r.productName, r.batchNumber, r.supplierName ?? "—", fmt(r.ht), fmt(r.vat), fmt(r.ttc)]),
        totals: [t("Total"), null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    } catch {
      toast(t("Could not export the report."), "error");
    } finally {
      setJournalBusy(false);
    }
  }

  async function cashBookPdf() {
    if (journalBusy) return;
    setJournalBusy(true);
    try {
      const rows = await reportsApi.cashBook(companyId, { from: from || undefined, to: to || undefined });
      if (rows.length === 0) return toast(t("No shifts in this period."), "info");
      printColoredReport({
        ...docBase(),
        title: t("Cash book"),
        meta: [{ label: t("Shifts"), value: String(rows.length) }],
        columns: [{ header: t("Opened") }, { header: t("Cashier") }, { header: t("Opening"), align: "right" }, { header: t("Cash sales"), align: "right" }, { header: t("Expected"), align: "right" }, { header: t("Counted"), align: "right" }, { header: t("Diff"), align: "right" }],
        rows: rows.map((r) => [new Date(r.openedAt).toLocaleString(), r.cashierName, fmt(r.openingCash), fmt(r.cashSales), r.expectedCash != null ? fmt(r.expectedCash) : "—", r.closingCash != null ? fmt(r.closingCash) : "—", r.discrepancy != null ? fmt(r.discrepancy) : "—"]),
      });
    } catch {
      toast(t("Could not export the report."), "error");
    } finally {
      setJournalBusy(false);
    }
  }

  async function incomeStatementPdf() {
    if (journalBusy) return;
    setJournalBusy(true);
    try {
      const s = await reportsApi.salesSummary(companyId, { from: from || undefined, to: to || undefined });
      printColoredReport({
        ...docBase(),
        title: t("Income statement"),
        meta: [{ label: t("Revenue"), value: fmt(s.totalRevenue) }, { label: t("Gross margin"), value: fmt(s.totalProfit) }],
        columns: [{ header: "" }, { header: t("Amount"), align: "right" }],
        rows: [
          [t("Revenue (sales)"), fmt(s.totalRevenue)],
          [t("Cost of goods sold"), `- ${fmt(s.totalCost)}`],
          [t("of which VAT collected"), fmt(s.totalTax)],
        ],
        totals: [t("Gross margin"), fmt(s.totalProfit)],
      });
    } catch {
      toast(t("Could not export the report."), "error");
    } finally {
      setJournalBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-text-primary">🧾 {t("VAT declaration (TVA)")}</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={salesJournalPdf} loading={journalBusy}>📋 {t("Sales journal")}</Button>
          <Button variant="secondary" onClick={purchasesJournalPdf} loading={journalBusy}>📥 {t("Purchases journal")}</Button>
          <Button variant="secondary" onClick={cashBookPdf} loading={journalBusy}>💵 {t("Cash book")}</Button>
          <Button variant="secondary" onClick={incomeStatementPdf} loading={journalBusy}>📈 {t("Income statement")}</Button>
          <Button variant="secondary" onClick={exportPdf} disabled={!d}>🖨 {t("VAT declaration")}</Button>
        </div>
      </div>

      <DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />

      {isFlatRegime ? (
        <div className="rounded-card border border-primary/40 bg-primary/5 p-5">
          <div className="text-sm font-semibold text-primary">🧾 {t("Impôt libératoire (flat tax)")}</div>
          <div className="mt-1 text-3xl font-extrabold text-text-primary">
            {fmt(company?.flatTaxAmount ?? 0)} <span className="text-base font-medium text-text-secondary">/ {flatPeriodLabel}</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {t("Your business is on the flat-tax regime — no VAT is collected on sales. This lump sum, set by your commune, is what you owe per period.")}
          </p>
        </div>
      ) : null}

      {noTax ? (
        <div className="rounded-card border border-border bg-surface p-6 text-center">
          <div className="text-3xl">🚫</div>
          <div className="mt-2 text-sm font-semibold text-text-primary">{t("No sales tax configured")}</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-text-secondary">
            {t("This business is set to \"No sales tax\" in Company settings, so there is no VAT declaration. Switch the accounting system to OHADA or Generic VAT to enable it.")}
          </p>
        </div>
      ) : null}

      {!noTax ? (
      <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard index={0} color="primary" icon="💵" label={t("Turnover (incl. VAT)")} value={fmt(d?.salesTtc ?? 0)} hint={`${t("excl. VAT")}: ${fmt(d?.salesHt ?? 0)}`} />
        <StatCard index={1} color="green" icon="📥" label={t("VAT collected")} value={fmt(d?.vatCollected ?? 0)} hint={showCodes ? "4431" : undefined} />
        <StatCard index={2} color="amber" icon="📤" label={t("VAT deductible")} value={fmt(d?.vatDeductible ?? 0)} hint={showCodes ? "4452" : undefined} />
        <StatCard index={3} color={d && d.vatDue < 0 ? "blue" : "red"} icon="🧾" label={t("VAT due")} value={fmt(d?.vatDue ?? 0)} hint={showCodes ? "4441" : undefined} />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">{t("Line")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Base (excl. VAT)")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("VAT / TVA")}</th>
              {showCodes ? <th className="px-4 py-3 font-semibold">{t("OHADA acct")}</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="px-4 py-3 font-medium text-text-primary">{t("VAT collected on sales")}</td>
              <td className="px-4 py-3 text-right text-text-primary">{fmt(d?.salesHt ?? 0)}</td>
              <td className="px-4 py-3 text-right font-semibold text-success">{fmt(d?.vatCollected ?? 0)}</td>
              {showCodes ? <td className="px-4 py-3 font-mono text-text-secondary">4431</td> : null}
            </tr>
            <tr className="border-b border-border/60">
              <td className="px-4 py-3 font-medium text-text-primary">{t("VAT deductible on purchases")}</td>
              <td className="px-4 py-3 text-right text-text-primary">{fmt(d?.purchasesHt ?? 0)}</td>
              <td className="px-4 py-3 text-right font-semibold text-accent-amber">{fmt(d?.vatDeductible ?? 0)}</td>
              {showCodes ? <td className="px-4 py-3 font-mono text-text-secondary">4452</td> : null}
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold text-text-primary">
              <td className="px-4 py-3">{t("VAT due (collected − deductible)")}</td>
              <td className="px-4 py-3" />
              <td className={`px-4 py-3 text-right ${d && d.vatDue < 0 ? "text-accent-blue" : "text-error"}`}>{fmt(d?.vatDue ?? 0)}</td>
              {showCodes ? <td className="px-4 py-3 font-mono text-text-secondary">4441</td> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {d && d.vatDue < 0 ? (
        <p className="text-xs font-medium text-accent-blue">ℹ️ {t("Negative VAT due means a VAT credit carried forward to the next period.")}</p>
      ) : null}

      <div className="rounded-xl border border-border bg-background/40 p-4 text-xs text-text-secondary">
        <p className="font-semibold text-text-primary">{t("Notes")}</p>
        <p className="mt-1">
          {showCodes
            ? t("Prices are VAT-inclusive (TTC). VAT deductible on purchases is estimated at the standard rate, as purchase records don't store a per-line rate — have your accountant confirm against actual supplier invoices. This report follows the SYSCOHADA VAT accounts and is a working document, not an official filing.")
            : t("Prices are VAT-inclusive (TTC). VAT deductible on purchases is estimated at the standard rate, as purchase records don't store a per-line rate — have your accountant confirm against actual supplier invoices. This is a working document, not an official filing.")}
        </p>
      </div>
      </>
      ) : null}
    </div>
  );
}
