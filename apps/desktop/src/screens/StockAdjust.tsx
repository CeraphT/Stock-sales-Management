import { ApiError } from "@stockflow/core/api/client";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { runSync } from "@/lib/sync/runSync";
import { useAuthStore } from "@/lib/stores";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary";

export function StockAdjust() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;

  const { data: product } = useQuery({
    queryKey: ["product", companyId, productId],
    queryFn: () => productsApi.get(companyId, productId!),
    enabled: !!productId,
  });
  const { data: batches = [] } = useQuery({
    queryKey: ["batches", companyId, productId],
    queryFn: () => productsApi.batches(companyId, productId!),
    enabled: !!productId,
  });

  const [batchId, setBatchId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await productsApi.adjustStock(companyId, productId!, {
        batchId,
        deltaInBaseUnits: Number(delta) || 0,
        reason: reason.trim(),
      });
      await runSync();
      navigate(`/products/${productId}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not adjust stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4">
        <BackButton />
      </div>
      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Adjust stock</h2>
          <p className="text-sm text-text-secondary">{product?.name ?? ""}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Batch</span>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={selectCls}>
            <option value="">— select batch —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchNumber} · {b.quantityInBaseUnits} in stock
                {b.expiryDate ? ` · exp ${b.expiryDate.slice(0, 10)}` : ""}
              </option>
            ))}
          </select>
        </label>

        <TextField
          label="Change (+ / −, base units)"
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="e.g. -3 for breakage"
        />
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="required" />

        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button onClick={submit} loading={busy} disabled={!batchId || !reason.trim() || Number(delta) === 0}>
          Apply adjustment
        </Button>
      </div>
    </div>
  );
}
