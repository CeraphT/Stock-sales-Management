import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { StatCard } from "@/components/StatCard";
import { StockBadge } from "@/components/StockBadge";
import { listInventory, type InventoryRow } from "@/data/inventory";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCompany, useCurrency } from "@/lib/useCompany";

const TODAY = new Date().toISOString().slice(0, 10);
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
function isExpired(r: InventoryRow): boolean {
  return r.earliestExpiry != null && r.earliestExpiry.slice(0, 10) < TODAY && r.stock > 0;
}
function isExpiringSoon(r: InventoryRow): boolean {
  if (r.earliestExpiry == null || r.stock <= 0) return false;
  const d = daysUntil(r.earliestExpiry);
  return d >= 0 && d <= 30;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function printReport(groups: [string, InventoryRow[]][], companyName: string, currency: string, note: string): void {
  const body = groups
    .map(([cat, rows]) => {
      const sub = rows.reduce((a, r) => ({ q: a.q + r.stock, c: a.c + r.costValue, s: a.s + r.retailValue }), { q: 0, c: 0, s: 0 });
      const lines = rows
        .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.supplierName)}</td><td class="r">${r.stock}</td><td class="r">${esc(formatCurrency(r.costValue, currency))}</td><td class="r">${esc(formatCurrency(r.retailValue, currency))}</td></tr>`)
        .join("");
      return `<tr class="cat"><td colspan="5">${esc(cat)}</td></tr>${lines}<tr class="sub"><td colspan="2">Subtotal</td><td class="r">${sub.q}</td><td class="r">${esc(formatCurrency(sub.c, currency))}</td><td class="r">${esc(formatCurrency(sub.s, currency))}</td></tr>`;
    })
    .join("");
  const all = groups.flatMap(([, r]) => r);
  const tc = all.reduce((s, r) => s + r.costValue, 0);
  const ts = all.reduce((s, r) => s + r.retailValue, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inventory</title><style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 2px}.n{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:10px;text-transform:uppercase;color:#666}
    td.r,th.r{text-align:right}tr.cat td{background:#eef2ff;color:#3730a3;font-weight:700}tr.sub td{font-weight:600;border-top:1px solid #ccc}tfoot td{border-top:2px solid #111;font-weight:700}@media print{body{margin:0}}</style></head><body>
    <h1>${esc(companyName)} — Inventory report</h1><div class="n">${esc(note)}</div>
    <table><thead><tr><th>Product</th><th>Supplier</th><th class="r">Stock</th><th class="r">Cost value</th><th class="r">Retail value</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${esc(formatCurrency(tc, currency))}</td><td class="r">${esc(formatCurrency(ts, currency))}</td></tr></tfoot></table></body></html>`;
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

const selectCls = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-primary";
const CAT_HUES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function InventoryReport() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const companyName = useCompany().data?.name ?? "";
  const t = useT();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");
  const [expiry, setExpiry] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory-report", companyId],
    queryFn: () => listInventory(companyId!),
    enabled: !!companyId,
  });

  const categoryNames = useMemo(() => [...new Set(rows.map((r) => r.categoryName))].sort(), [rows]);
  const supplierNames = useMemo(() => [...new Set(rows.map((r) => r.supplierName))].sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!category || r.categoryName === category) &&
        (!supplier || r.supplierName === supplier) &&
        (!status || r.status === status) &&
        (!s || r.name.toLowerCase().includes(s) || (r.barcode ?? "").includes(s)) &&
        (expiry === "" || (expiry === "expired" ? isExpired(r) : isExpiringSoon(r))),
    );
  }, [rows, search, category, supplier, status, expiry]);

  const groups = useMemo(() => {
    const m = new Map<string, InventoryRow[]>();
    for (const r of filtered) (m.get(r.categoryName) ?? m.set(r.categoryName, []).get(r.categoryName)!).push(r);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalUnits = filtered.reduce((s, r) => s + r.stock, 0);
  const totalCost = filtered.reduce((s, r) => s + r.costValue, 0);
  const totalRetail = filtered.reduce((s, r) => s + r.retailValue, 0);
  const margin = totalRetail - totalCost;
  const hasFilter = search || category || supplier || status || expiry;
  const note =
    [category && `${t("Category")}: ${category}`, supplier && `${t("Supplier")}: ${supplier}`, status && t(status === "low_stock" ? "Low stock" : status === "out_of_stock" ? "Out of stock" : "In stock"), expiry && t(expiry === "expired" ? "Expired" : "Expiring soon")]
      .filter(Boolean)
      .join(" · ") || t("All products");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Colored KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard index={0} color="neutral" icon="📦" label={t("Products")} value={String(filtered.length)} />
        <StatCard index={1} color="blue" icon="🔢" label={t("Units in stock")} value={String(totalUnits)} />
        <StatCard index={2} color="amber" icon="🏷️" label={t("Cost value")} value={formatCurrency(totalCost, currency)} />
        <StatCard index={3} color="green" icon="💰" label={t("Retail value")} value={formatCurrency(totalRetail, currency)} />
        <StatCard index={4} color="primary" icon="📈" label={t("Potential margin")} value={formatCurrency(margin, currency)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search products by name or barcode…")}
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          <option value="">{t("All categories")}</option>
          {categoryNames.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={selectCls}>
          <option value="">{t("All suppliers")}</option>
          {supplierNames.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">{t("Any stock")}</option>
          <option value="in_stock">{t("In stock")}</option>
          <option value="low_stock">{t("Low stock")}</option>
          <option value="out_of_stock">{t("Out of stock")}</option>
        </select>
        <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={selectCls}>
          <option value="">{t("Any expiry")}</option>
          <option value="expiring">{t("Expiring soon")}</option>
          <option value="expired">{t("Expired")}</option>
        </select>
        {hasFilter ? (
          <button
            onClick={() => {
              setSearch("");
              setCategory("");
              setSupplier("");
              setStatus("");
              setExpiry("");
            }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:text-error"
          >
            ✕ {t("Clear")}
          </button>
        ) : null}
        <Button variant="secondary" onClick={() => printReport(groups, companyName, currency, note)} disabled={filtered.length === 0}>
          🖨 {t("Print report")}
        </Button>
      </div>

      {/* Grouped table */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-2.5 font-semibold">{t("Product")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("Supplier")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("Status")}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t("Stock")}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t("Cost value")}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t("Retail value")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-secondary">{t("Loading…")}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-secondary">{t("No products.")}</td></tr>
            ) : (
              groups.map(([cat, catRows], gi) => {
                const hue = CAT_HUES[gi % CAT_HUES.length];
                const sub = catRows.reduce((a, r) => ({ q: a.q + r.stock, c: a.c + r.costValue, s: a.s + r.retailValue }), { q: 0, c: 0, s: 0 });
                return (
                  <Fragment key={cat}>
                    <tr style={{ backgroundColor: `${hue}14` }}>
                      <td colSpan={6} className="px-4 py-2">
                        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: hue }}>
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hue }} />
                          {cat} <span className="font-normal text-text-secondary">· {catRows.length}</span>
                        </span>
                      </td>
                    </tr>
                    {catRows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 transition-colors hover:bg-background/50">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-text-primary">{r.name}</span>
                          {isExpired(r) ? (
                            <span className="ml-1.5 rounded bg-error/15 px-1.5 py-0.5 text-[10px] font-bold text-error">{t("Expired")}</span>
                          ) : isExpiringSoon(r) ? (
                            <span className="ml-1.5 rounded bg-accent-orange/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-orange">{t("Expiring soon")}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-text-secondary">{r.supplierName}</td>
                        <td className="px-4 py-2.5"><StockBadge status={r.status} /></td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text-primary tabular-nums">{r.stock}</td>
                        <td className="px-4 py-2.5 text-right text-text-secondary tabular-nums">{formatCurrency(r.costValue, currency)}</td>
                        <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(r.retailValue, currency)}</td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-border/70" style={{ backgroundColor: `${hue}0a` }}>
                      <td className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-secondary" colSpan={3}>{t("Subtotal")}</td>
                      <td className="px-4 py-2 text-right font-bold text-text-primary tabular-nums">{sub.q}</td>
                      <td className="px-4 py-2 text-right font-bold text-text-primary tabular-nums">{formatCurrency(sub.c, currency)}</td>
                      <td className="px-4 py-2 text-right font-bold text-text-primary tabular-nums">{formatCurrency(sub.s, currency)}</td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
          {!isLoading && filtered.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-primary/40 bg-primary/5">
                <td className="px-4 py-3 text-sm font-extrabold text-text-primary" colSpan={3}>{t("Total")}</td>
                <td className="px-4 py-3 text-right text-sm font-extrabold text-text-primary tabular-nums">{totalUnits}</td>
                <td className="px-4 py-3 text-right text-sm font-extrabold text-text-primary tabular-nums">{formatCurrency(totalCost, currency)}</td>
                <td className="px-4 py-3 text-right text-sm font-extrabold text-text-primary tabular-nums">{formatCurrency(totalRetail, currency)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
