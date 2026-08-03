import { ApiError } from "@stockflow/core/api/client";
import { customersApi } from "@stockflow/core/api/endpoints/customers";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function Customers() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<{ name: string; phone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["customers", companyId, search],
    queryFn: () => customersApi.list(companyId, search || undefined),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const createM = useMutation({
    mutationFn: (v: { name: string; phone: string }) =>
      customersApi.create(companyId, { name: v.name.trim(), phone: v.phone.trim() || null }),
    onSuccess: () => {
      setAdding(null);
      setError(null);
      invalidate();
    },
    onError,
  });

  const redeemM = useMutation({
    mutationFn: (v: { id: string; points: number }) => customersApi.redeemLoyalty(companyId, v.id, { points: v.points }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  function redeem(id: string, available: number) {
    const raw = window.prompt(`Redeem how many points? (${available} available)`, String(available));
    if (raw == null) return;
    const points = Number(raw);
    if (points > 0) redeemM.mutate({ id, points });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="h-10 w-72 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        {!adding ? <Button onClick={() => setAdding({ name: "", phone: "" })}>+ New customer</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">New customer</div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            <TextField label="Phone" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
          </div>
          {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(null); setError(null); }}>
              Cancel
            </Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 text-right font-semibold">Credit</th>
              <th className="px-4 py-3 text-right font-semibold">Points</th>
              <th className="px-4 py-3 text-right font-semibold">Store credit</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                  No customers yet.
                </td>
              </tr>
            ) : (
              data.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(c.creditBalance, currency)}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{c.loyaltyPointsBalance}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(c.loyaltyStoreCreditBalance, currency)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.loyaltyPointsBalance > 0 ? (
                      <button onClick={() => redeem(c.id, c.loyaltyPointsBalance)} className="text-sm font-semibold text-primary">
                        Redeem
                      </button>
                    ) : null}
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
