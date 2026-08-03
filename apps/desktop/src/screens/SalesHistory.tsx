import { salesApi } from "@stockflow/core/api/endpoints/sales";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

type Range = "today" | "7d" | "30d" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All" },
];

function fromForRange(range: Range): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "7d") d.setDate(d.getDate() - 6);
  if (range === "30d") d.setDate(d.getDate() - 29);
  return d.toISOString();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SalesHistory() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();
  const [range, setRange] = useState<Range>("7d");
  const from = fromForRange(range);

  const { data, fetchNextPage, hasNextPage, isFetching, isLoading } = useInfiniteQuery({
    queryKey: ["sales-history", companyId, range],
    queryFn: ({ pageParam }) => salesApi.history(companyId!, pageParam, from, undefined),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: !!companyId,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
              range === r.key ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-surface"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Cashier</th>
              <th className="px-4 py-3 text-right font-semibold">Items</th>
              <th className="px-4 py-3 font-semibold">Payment</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  No sales in this period.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/sales/${s.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-background/60"
                >
                  <td className="px-4 py-3 text-text-primary">{formatWhen(s.timestamp)}</td>
                  <td className="px-4 py-3 text-text-secondary">{s.cashierName}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{s.itemCount}</td>
                  <td className="px-4 py-3 text-text-secondary">{paymentMethodLabel(s.paymentMethod)}</td>
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
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
