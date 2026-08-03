import { ApiError } from "@stockflow/core/api/client";
import { servicesApi } from "@stockflow/core/api/endpoints/services";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

export function Services() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const [adding, setAdding] = useState<{ name: string; price: string; category: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["services", companyId], queryFn: () => servicesApi.list(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const createM = useMutation({
    mutationFn: (v: { name: string; price: string; category: string }) =>
      servicesApi.create(companyId, { name: v.name.trim(), fixedPrice: Number(v.price) || 0, category: v.category.trim() || null, stockLinks: null }),
    onSuccess: () => { setAdding(null); setError(null); invalidate(); },
    onError,
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => servicesApi.setActive(companyId, v.id, { active: v.active }),
    onSuccess: () => { setError(null); invalidate(); },
    onError,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} services</span>
        {!adding ? <Button onClick={() => setAdding({ name: "", price: "", category: "" })}>+ New service</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">New service</div>
          <TextField label="Name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Fixed price" type="number" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} />
            <TextField label="Category (optional)" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} />
          </div>
          {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(null); setError(null); }}>Cancel</Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim()}>Save</Button>
          </div>
        </div>
      ) : null}

      {error && !adding ? <p className="mb-3 text-sm font-medium text-error">{error}</p> : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">No services. (Requires the Services module — enable it in Company settings.)</div>
        ) : (
          data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="flex-1">
                <div className="font-medium text-text-primary">{s.name}</div>
                <div className="text-xs text-text-secondary">{[s.category, formatCurrency(s.fixedPrice, currency)].filter(Boolean).join(" · ")}</div>
              </div>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${s.active ? "bg-success/15 text-success" : "bg-text-secondary/15 text-text-secondary"}`}>
                {s.active ? "Active" : "Inactive"}
              </span>
              <button onClick={() => toggleM.mutate({ id: s.id, active: !s.active })} className="text-sm font-semibold text-primary">
                {s.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
