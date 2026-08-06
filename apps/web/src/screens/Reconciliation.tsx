import { reconciliationApi } from "@stockflow/core/api/endpoints/reconciliation";
import { formatCurrency } from "@stockflow/core/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/lib/useCompany";

export function Reconciliation() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reconciliation", companyId],
    queryFn: () => reconciliationApi.get(companyId!),
    enabled: !!companyId,
  });

  const conflicts = data?.conflictShifts ?? [];
  const negatives = data?.negativeBatches ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({ predicate: (q) => ["reconciliation", "dashboard-summary"].includes(q.queryKey[0] as string) });

  async function acknowledgeOne(shiftId: string) {
    if (!companyId || busy) return;
    setBusy(shiftId);
    try {
      await reconciliationApi.acknowledgeShift(companyId, shiftId);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Could not update."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function acknowledgeAll() {
    if (!companyId || busy) return;
    setBusy("all");
    try {
      const res = await reconciliationApi.acknowledgeShiftConflicts(companyId);
      refresh();
      toast(`${res.acknowledged} ${t("shift(s) marked reviewed.")}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Could not update."), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">{t("Reconciliation")}</h2>
        <span className="w-12" />
      </div>

      {isLoading ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">{t("Loading…")}</div>
      ) : conflicts.length === 0 && negatives.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">
          ✓ {t("Nothing to reconcile.")}
        </div>
      ) : (
        <>
          {/* Auto-closed shift conflicts */}
          {conflicts.length > 0 ? (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
                <div>
                  <div className="text-sm font-bold text-text-primary">{t("Auto-closed shifts")}</div>
                  <div className="text-xs text-text-secondary">
                    {t("Closed automatically when two devices opened a register at the same time. Review the numbers, then mark as reviewed.")}
                  </div>
                </div>
                <Button variant="secondary" onClick={acknowledgeAll} loading={busy === "all"}>
                  {t("Mark all reviewed")}
                </Button>
              </div>
              {conflicts.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      {s.locationName} · {new Date(s.openedAt).toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {t("Opened by")} {s.openedByName} · {t("Float")} {formatCurrency(s.openingCashAmount, currency)}
                      {s.closingCashAmount != null ? ` · ${t("Counted")} ${formatCurrency(s.closingCashAmount, currency)}` : ""}
                      {s.discrepancy != null && s.discrepancy !== 0 ? (
                        <span className={s.discrepancy > 0 ? "text-accent-amber" : "text-error"}>
                          {" "}· {s.discrepancy > 0 ? t("over") : t("short")} {formatCurrency(Math.abs(s.discrepancy), currency)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => acknowledgeOne(s.id)} loading={busy === s.id}>
                    {t("Mark reviewed")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Negative-stock batches */}
          {negatives.length > 0 ? (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-5 py-3">
                <div className="text-sm font-bold text-text-primary">{t("Negative stock")}</div>
                <div className="text-xs text-text-secondary">
                  {t("These batches went below zero from an offline sale. Adjust their stock to a correct count.")}
                </div>
              </div>
              {negatives.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">{b.productName}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {t("Batch")} {b.batchNumber || "—"} · {b.locationName} ·{" "}
                      <span className="font-semibold text-error">{b.quantityInBaseUnits}</span>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => navigate(`/products/${b.productId}/adjust`)}>
                    {t("Adjust stock")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
