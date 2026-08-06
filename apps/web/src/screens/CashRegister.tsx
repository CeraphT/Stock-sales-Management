import { PaymentMethod, ShiftStatus } from "@stockflow/core/api/enums";
import type { ShiftDetailResponse } from "@stockflow/core/api/types/shifts";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { localShiftService } from "@stockflow/core/local/shiftService";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { buildDailyRows, printCashReport } from "@/lib/cashReport";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCompany, useCurrency } from "@/lib/useCompany";

function methodTotal(shift: ShiftDetailResponse, method: PaymentMethod): number {
  return shift.paymentBreakdown.find((b) => b.method === method)?.total ?? 0;
}

export function CashRegister() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const locationId = useAuthStore((s) => s.locationId);
  const locationName = useAuthStore((s) => s.locationName);
  const currency = useCurrency();
  const companyName = useCompany().data?.name ?? "";
  const t = useT();

  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: current, isLoading } = useQuery({
    queryKey: ["current-shift", companyId, locationId],
    queryFn: () => localShiftService.getCurrentShift(companyId, locationId!),
    enabled: !!locationId,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["shift-history", companyId, locationId],
    queryFn: () => localShiftService.getShiftHistory(companyId, locationId!),
    enabled: !!locationId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ predicate: (q) => ["current-shift", "shift-history"].includes(q.queryKey[0] as string) });

  async function openShift() {
    if (busy || !locationId) return;
    setBusy(true);
    try {
      await localShiftService.openShift(companyId, locationId, Number(openingCash) || 0);
      setOpeningCash("");
      toast("Cash register opened.", "success");
      invalidate();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the register.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (busy || !current) return;
    setBusy(true);
    try {
      const closed = await localShiftService.closeShift(companyId, current.id, Number(closingCash) || 0, notes.trim() || null);
      setClosingCash("");
      setNotes("");
      const d = closed.discrepancy ?? 0;
      toast(
        d === 0 ? "Register closed — cash balanced." : `Register closed — ${d > 0 ? "over" : "short"} by ${formatCurrency(Math.abs(d), currency)}.`,
        d === 0 ? "success" : "info",
      );
      invalidate();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not close the register.", "error");
    } finally {
      setBusy(false);
    }
  }

  const expectedCash = current ? current.openingCashAmount + methodTotal(current, PaymentMethod.Cash) : 0;

  // Closed shifts within the picked date range → one row per day.
  const closedInRange = history.filter((h) => {
    if (h.status !== ShiftStatus.Closed) return false;
    const d = h.openedAt.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const dailyRows = buildDailyRows(closedInRange);
  const totCash = dailyRows.reduce((s, r) => s + r.cash, 0);
  const totMobile = dailyRows.reduce((s, r) => s + r.mobile, 0);
  const totAll = dailyRows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {isLoading ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">Loading…</div>
      ) : current ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
                <span className="text-lg font-bold text-text-primary">{t("Register open")}</span>
              </div>
              <div className="text-xs text-text-secondary">
                {locationName ?? current.locationName} · {t("opened")} {new Date(current.openedAt).toLocaleString()} {t("by")} {current.openedByName}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-text-secondary">{t("Opening float")}</div>
              <div className="text-lg font-bold text-text-primary">{formatCurrency(current.openingCashAmount, currency)}</div>
            </div>
          </div>

          {/* Cash vs mobile money — the whole point: monitor each tender stream. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">💵 {t("Cash sales")}</div>
              <div className="mt-1 text-2xl font-extrabold text-text-primary tabular-nums">{formatCurrency(methodTotal(current, PaymentMethod.Cash), currency)}</div>
              <div className="mt-1 text-xs text-text-secondary">{t("Expected in drawer:")} {formatCurrency(expectedCash, currency)}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">📱 {t("Mobile money")}</div>
              <div className="mt-1 text-2xl font-extrabold text-text-primary tabular-nums">{formatCurrency(methodTotal(current, PaymentMethod.MobileMoney), currency)}</div>
              <div className="mt-1 text-xs text-text-secondary">{t("Not in the cash drawer")}</div>
            </div>
          </div>

          {/* Every other tender used this shift. */}
          {current.paymentBreakdown.length > 0 ? (
            <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("All tenders")} · {current.salesCount} {current.salesCount === 1 ? t("sale") : t("sales")}</div>
              {current.paymentBreakdown.map((b) => (
                <div key={b.method} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{paymentMethodLabel(b.method)}</span>
                  <span className="font-semibold text-text-primary tabular-nums">{formatCurrency(b.total, currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-sm">
                <span className="font-semibold text-text-primary">{t("Total sales")}</span>
                <span className="font-bold text-text-primary tabular-nums">{formatCurrency(current.totalSales, currency)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">{t("No sales on this shift yet.")}</p>
          )}

          {/* Close = count the physical CASH only (mobile money is electronic). */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-sm font-bold text-text-primary">{t("Close register")}</div>
            <p className="mb-2 text-xs text-text-secondary">{t("Count the physical cash in the drawer — mobile money is not counted here.")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Cash counted")}</span>
                <input
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  inputMode="decimal"
                  placeholder={String(Math.round(expectedCash))}
                  className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Notes (optional)")}</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
              <Button variant="danger" onClick={closeShift} loading={busy} disabled={!closingCash.trim()}>
                {t("Close register")}
              </Button>
            </div>
            {closingCash.trim() ? (
              <div className="mt-2 text-sm text-text-secondary">
                {t("Expected")} {formatCurrency(expectedCash, currency)} ·{" "}
                {(() => {
                  const d = (Number(closingCash) || 0) - expectedCash;
                  return (
                    <span className={`font-bold ${d === 0 ? "text-success" : d > 0 ? "text-accent-amber" : "text-error"}`}>
                      {d === 0 ? t("balanced") : d > 0 ? `${t("over by")} ${formatCurrency(d, currency)}` : `${t("short by")} ${formatCurrency(-d, currency)}`}
                    </span>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="text-lg font-bold text-text-primary">{t("Register closed")}</div>
          <p className="mb-3 text-sm text-text-secondary">{t("Open the register with the cash float you're starting the day with.")}</p>
          <div className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Opening cash float")}</span>
              <input
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
            <Button onClick={openShift} loading={busy}>
              {t("Open register")}
            </Button>
          </div>
        </div>
      )}

      {/* Daily takings report — per-day cash vs mobile, date-filtered + printable. */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <span className="text-sm font-bold text-text-primary">{t("Daily takings")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
            <Button variant="secondary" onClick={() => printCashReport(dailyRows, companyName, currency, from, to)} disabled={dailyRows.length === 0}>
              🖨 {t("Print report")}
            </Button>
          </div>
        </div>
        {dailyRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t("No takings in this range.")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2.5 font-semibold">{t("Day")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">💵 {t("Cash")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">📱 {t("Mobile")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Total sales")}</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.date} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-text-primary">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(r.cash, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(r.mobile, currency)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-text-primary tabular-nums">{formatCurrency(r.total, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="px-4 py-2.5 text-text-primary">{t("Total")}</td>
                <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(totCash, currency)}</td>
                <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(totMobile, currency)}</td>
                <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(totAll, currency)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Per-shift history */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="border-b border-border px-5 py-3 text-sm font-bold text-text-primary">{t("Shift history")}</div>
        {history.filter((h) => h.status === ShiftStatus.Closed).length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t("No closed shifts yet.")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2.5 font-semibold">{t("Opened")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("By")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">💵 {t("Cash")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">📱 {t("Mobile")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Total")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Discrepancy")}</th>
              </tr>
            </thead>
            <tbody>
              {history
                .filter((h) => h.status === ShiftStatus.Closed)
                .map((h) => (
                  <tr key={h.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 text-text-primary">{new Date(h.openedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{h.openedByName}</td>
                    <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(methodTotal(h, PaymentMethod.Cash), currency)}</td>
                    <td className="px-4 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(methodTotal(h, PaymentMethod.MobileMoney), currency)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-text-primary tabular-nums">{formatCurrency(h.totalSales, currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {h.discrepancy == null || h.discrepancy === 0 ? (
                        <span className="text-success">{t("balanced")}</span>
                      ) : (
                        <span className={h.discrepancy > 0 ? "text-accent-amber" : "text-error"}>{formatCurrency(h.discrepancy, currency)}</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
