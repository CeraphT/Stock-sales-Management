import { salesApi } from "@stockflow/core/api/endpoints/sales";
import { formatCurrency, paymentMethodLabel } from "@stockflow/core/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { DateRange } from "@/components/DateRange";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SalesHistory() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCurrency();

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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <DateRange
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
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
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-background/60"
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
