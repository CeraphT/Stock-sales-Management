import { SaleTimelineKind } from "@stockflow/core/api/types/sales";
import { salesApi } from "@stockflow/core/api/endpoints/sales";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { useT } from "@/lib/i18n";
import { printReceiptsBatch } from "@/lib/receipt";
import { printColoredReport } from "@/lib/reportPdf";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCompany, useCurrency } from "@/lib/useCompany";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SalesHistory() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printingBatch, setPrintingBatch] = useState(false);

  // Seed the range from the URL (e.g. a Dashboard "today" deep-link).
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const { data, fetchNextPage, hasNextPage, isFetching, isLoading } = useInfiniteQuery({
    queryKey: ["sales-history", companyId, from, to],
    queryFn: ({ pageParam }) => salesApi.history(companyId!, pageParam, from || undefined, to || undefined),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: !!companyId,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  // Only real sales are selectable for receipts / counted as revenue; gift-card
  // issuance rows are non-revenue audit lines.
  const saleItems = items.filter((s) => s.kind === SaleTimelineKind.Sale);
  const allSelected = saleItems.length > 0 && saleItems.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(saleItems.map((s) => s.id)));
  }

  // Fetch each selected sale's detail and print them as one paged document —
  // the "download a filtered set of receipts at once" flow.
  async function downloadSelectedReceipts() {
    if (!companyId || selected.size === 0 || printingBatch) return;
    setPrintingBatch(true);
    try {
      const details = await Promise.all([...selected].map((id) => salesApi.detail(companyId, id)));
      printReceiptsBatch(details, {
        name: company?.name ?? "",
        currency,
        logoUrl: company?.logoUrl,
        address: company?.address,
        phone: company?.phone,
        receiptFooter: company?.receiptFooter,
      });
      setSelected(new Set());
    } catch {
      toast(t("Could not load the selected receipts."), "error");
    } finally {
      setPrintingBatch(false);
    }
  }

  // Export ALL sales in the current range (not just the loaded pages) to a
  // colored PDF the user can print or save-as-PDF to share.
  async function exportPdf() {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      const all: typeof items = [];
      let page = 1;
      // Guard the loop so a bad hasMore can never spin forever.
      for (let i = 0; i < 200; i++) {
        const res = await salesApi.history(companyId, page, from || undefined, to || undefined);
        // Revenue report excludes gift-card issuance audit lines.
        all.push(...res.items.filter((s) => s.kind === SaleTimelineKind.Sale));
        if (!res.hasMore) break;
        page++;
      }
      if (all.length === 0) {
        toast(t("No sales in this period."), "info");
        return;
      }
      const grand = all.reduce((s, x) => s + x.total, 0);
      const range = from || to ? `${from || "…"} → ${to || t("today")}` : t("All time");
      printColoredReport({
        companyName: company?.name ?? "",
        logoUrl: company?.logoUrl,
        taxId: company?.taxId,
        contact: [company?.address, company?.phone].filter(Boolean).join(" · ") || null,
        title: t("Sales report"),
        subtitle: range,
        meta: [
          { label: t("Sales"), value: String(all.length) },
          { label: t("Revenue"), value: formatCurrency(grand, currency) },
        ],
        columns: [
          { header: t("When") },
          { header: t("Customer") },
          { header: t("Cashier") },
          { header: t("Items"), align: "right" },
          { header: t("Payment") },
          { header: t("Total"), align: "right" },
        ],
        rows: all.map((s) => [
          formatWhen(s.timestamp),
          s.customerName ?? t("Walk-in"),
          s.cashierName,
          String(s.itemCount),
          t(paymentMethodLabel(s.paymentMethod)),
          formatCurrency(s.total, currency),
        ]),
        totals: [t("Total"), null, null, null, null, formatCurrency(grand, currency)],
      });
    } catch {
      toast(t("Could not export the report."), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <DateRange
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        </div>
        {selected.size > 0 ? (
          <Button onClick={downloadSelectedReceipts} loading={printingBatch}>
            🧾 {t("Download")} {selected.size} {selected.size === 1 ? t("receipt") : t("receipts")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={exportPdf} loading={exporting} disabled={items.length === 0 && !isLoading}>
          🧾 {t("Export PDF")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 cursor-pointer" title={t("Select all")} />
              </th>
              <th className="px-4 py-3 font-semibold">{t("When")}</th>
              <th className="px-4 py-3 font-semibold">{t("Customer")}</th>
              <th className="px-4 py-3 font-semibold">{t("Cashier")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Items")}</th>
              <th className="px-4 py-3 font-semibold">{t("Payment")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("Total")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-text-secondary">
                  {t("Loading…")}
                </td>
              </tr>
            ) : saleItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-text-secondary">
                  {t("No sales in this period.")}
                </td>
              </tr>
            ) : (
              // Sales only. Gift-card issuances are shown on the Gift Cards
              // screen, not here (they aren't revenue).
              saleItems.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/sales/${s.id}`)}
                  className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-background/60 ${selected.has(s.id) ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-text-primary">{formatWhen(s.timestamp)}</td>
                  <td className="px-4 py-3 text-text-primary">
                    {s.customerName ?? <span className="text-text-secondary">{t("Walk-in")}</span>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{s.cashierName}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{s.itemCount}</td>
                  <td className="px-4 py-3 text-text-secondary">{t(paymentMethodLabel(s.paymentMethod))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">{formatCurrency(s.total, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetching}>
            {t("Load more")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
