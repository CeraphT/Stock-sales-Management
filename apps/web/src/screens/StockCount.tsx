import { ApiError } from "@stockflow/core/api/client";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { runSync } from "@/lib/sync/runSync";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

export function StockCount() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const locationId = useAuthStore((s) => s.locationId)!;
  const t = useT();

  const { data: batches = [], refetch } = useQuery({
    queryKey: ["company-batches", companyId, locationId],
    queryFn: () => productsApi.companyBatches(companyId, locationId),
    enabled: !!companyId,
  });

  const [search, setSearch] = useState("");
  // Map of batchId → the counted quantity typed by the user (blank = not counted yet).
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? batches.filter((b) => b.productName.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q)) : batches;
  }, [batches, search]);

  // Only batches where a number was entered AND it differs from the system count.
  const variances = useMemo(
    () =>
      batches
        .filter((b) => counts[b.batchId] !== undefined && counts[b.batchId] !== "")
        .map((b) => ({ b, counted: Number(counts[b.batchId]), delta: Number(counts[b.batchId]) - b.quantityInBaseUnits }))
        .filter((v) => Number.isFinite(v.counted) && v.delta !== 0),
    [batches, counts],
  );

  async function post() {
    if (busy || variances.length === 0) return;
    setBusy(true);
    try {
      const result = await productsApi.countStock(companyId, {
        lines: variances.map((v) => ({ batchId: v.b.batchId, countedQuantityInBaseUnits: v.counted })),
      });
      await runSync();
      await refetch();
      setCounts({});
      const applied = result.filter((r) => r.delta !== 0).length;
      toast(`${t("Count posted —")} ${applied} ${t("batch(es) adjusted.")}`, "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not post the count."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">📋 {t("Stock count")}</h2>
        <span className="w-12" />
      </div>

      <p className="text-sm text-text-secondary">
        {t("Enter the physically-counted quantity for each batch. Only rows that differ from the system count are adjusted.")}
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("Search product or batch…")}
        className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
      />

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-2.5 font-semibold">{t("Product")}</th>
              <th className="px-3 py-2.5 font-semibold">{t("Batch")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("System")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Counted")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Variance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const raw = counts[b.batchId];
              const counted = raw === undefined || raw === "" ? null : Number(raw);
              const delta = counted == null ? null : counted - b.quantityInBaseUnits;
              return (
                <tr key={b.batchId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{b.productName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">{b.batchNumber}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{b.quantityInBaseUnits}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={raw ?? ""}
                      onChange={(e) => setCounts((c) => ({ ...c, [b.batchId]: e.target.value }))}
                      type="number"
                      placeholder="—"
                      className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-right text-sm text-text-primary outline-none focus:border-primary"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${delta == null || delta === 0 ? "text-text-secondary" : delta > 0 ? "text-success" : "text-error"}`}>
                    {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-text-secondary">{t("No stock batches to count.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between rounded-card border border-border bg-surface p-4">
        <span className="text-sm text-text-secondary">
          {variances.length} {t("batch(es) with a variance")}
        </span>
        <Button onClick={post} loading={busy} disabled={variances.length === 0}>
          {t("Post count & adjust")}
        </Button>
      </div>
    </div>
  );
}
