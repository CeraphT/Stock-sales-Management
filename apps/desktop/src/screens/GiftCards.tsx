import { ApiError } from "@stockflow/core/api/client";
import { giftCardsApi } from "@stockflow/core/api/endpoints/giftCards";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function GiftCards() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["giftcards", companyId],
    queryFn: () => giftCardsApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["giftcards", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const issueM = useMutation({
    mutationFn: () => giftCardsApi.issue(companyId, { initialValue: Number(amount) }),
    onSuccess: () => {
      setAmount("");
      setError(null);
      invalidate();
    },
    onError,
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => giftCardsApi.setActive(companyId, v.id, { active: v.active }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Issue a gift card</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="Initial value"
            className="h-11 w-48 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
        </label>
        <Button onClick={() => issueM.mutate()} loading={issueM.isPending} disabled={Number(amount) <= 0}>
          Issue card
        </Button>
      </div>

      {error ? <p className="mb-3 text-sm font-medium text-error">{error}</p> : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 text-right font-semibold">Initial</th>
              <th className="px-4 py-3 text-right font-semibold">Remaining</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  No gift cards issued yet.
                </td>
              </tr>
            ) : (
              data.map((g) => (
                <tr key={g.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono font-medium text-text-primary">{g.code}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatCurrency(g.initialValue, currency)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">{formatCurrency(g.remainingValue, currency)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${g.active ? "bg-success/15 text-success" : "bg-text-secondary/15 text-text-secondary"}`}
                    >
                      {g.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleM.mutate({ id: g.id, active: !g.active })}
                      className="text-sm font-semibold text-primary"
                    >
                      {g.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
