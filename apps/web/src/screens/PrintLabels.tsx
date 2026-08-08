import { productsApi } from "@stockflow/core/api/endpoints/products";
import type { ProductSearchResult } from "@stockflow/core/api/types/catalog";
import { code128Svg } from "@stockflow/core/barcode/code128";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";
import { toast } from "@/lib/toast";

interface LabelPick {
  productId: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  count: number;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function PrintLabels() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();

  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<LabelPick[]>([]);

  const { data: results = [] } = useQuery({
    queryKey: ["label-search", companyId, search],
    queryFn: () => productsApi.search(companyId, search),
    enabled: !!companyId && search.trim().length > 0,
  });

  function addPick(p: ProductSearchResult) {
    setPicks((cur) =>
      cur.some((x) => x.productId === p.productId)
        ? cur
        : [...cur, { productId: p.productId, name: p.name, barcode: p.barcode, salePrice: p.salePrice, count: 1 }],
    );
    setSearch("");
  }

  function print() {
    const labels: string[] = [];
    for (const p of picks) {
      const svg = p.barcode ? code128Svg(p.barcode, { moduleWidth: 1.6, height: 46 }) : null;
      for (let i = 0; i < p.count; i++) {
        labels.push(`
          <div class="label">
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="price">${escapeHtml(formatCurrency(p.salePrice, currency))}</div>
            ${svg ? `<div class="bc">${svg}</div><div class="code">${escapeHtml(p.barcode!)}</div>` : `<div class="nobc">${t("No barcode")}</div>`}
          </div>`);
      }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t("Labels")}</title><style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: system-ui, sans-serif; }
      .sheet { display: flex; flex-wrap: wrap; gap: 4mm; padding: 6mm; }
      .label { width: 50mm; height: 30mm; border: 1px dashed #bbb; padding: 2mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .name { font-size: 10px; font-weight: 600; line-height: 1.1; max-height: 22px; overflow: hidden; }
      .price { font-size: 13px; font-weight: 800; margin: 1mm 0; }
      .bc svg { display: block; height: 46px; width: auto; max-width: 46mm; }
      .code { font-size: 8px; letter-spacing: 1px; }
      .nobc { font-size: 8px; color: #999; }
      @media print { .label { border-color: transparent; } }
    </style></head><body><div class="sheet">${labels.join("")}</div>
    <script>window.onload = function(){ window.focus(); window.print(); };</script>
    </body></html>`;

    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) {
      toast(t("Allow pop-ups to print labels."), "error");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  const totalLabels = picks.reduce((n, p) => n + p.count, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">🏷️ {t("Print labels")}</h2>
        <span className="w-12" />
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search a product to add…")}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        {search.trim() && results.length > 0 ? (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
            {results.map((r) => (
              <button key={r.productId} onClick={() => addPick(r)} className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-background">
                {r.name} {r.barcode ? <span className="text-xs text-text-secondary">· {r.barcode}</span> : <span className="text-xs text-accent-amber">· {t("no barcode")}</span>}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {picks.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-sm text-text-secondary">
          {t("Add products to print price/barcode labels.")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {picks.map((p) => (
            <div key={p.productId} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="flex-1">
                <div className="text-sm font-medium text-text-primary">{p.name}</div>
                <div className="text-xs text-text-secondary">
                  {formatCurrency(p.salePrice, currency)} · {p.barcode ?? <span className="text-accent-amber">{t("no barcode")}</span>}
                </div>
              </div>
              <input
                type="number"
                value={p.count}
                min={1}
                onChange={(e) => setPicks((cur) => cur.map((x) => (x.productId === p.productId ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))}
                className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm text-text-primary"
              />
              <button onClick={() => setPicks((cur) => cur.filter((x) => x.productId !== p.productId))} className="text-text-secondary hover:text-error">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{totalLabels} {t("label(s)")}</span>
        <Button onClick={print} disabled={totalLabels === 0}>🖨 {t("Print")}</Button>
      </div>
    </div>
  );
}
