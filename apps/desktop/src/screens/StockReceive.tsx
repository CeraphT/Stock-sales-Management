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

export function StockReceive() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;
  const locationId = useAuthStore((s) => s.locationId)!;

  const { data: product } = useQuery({
    queryKey: ["product", companyId, productId],
    queryFn: () => productsApi.get(companyId, productId!),
    enabled: !!productId,
  });

  const [batchNumber, setBatchNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await productsApi.receiveStock(companyId, productId!, {
        locationId,
        batchNumber: batchNumber.trim(),
        expiryDate: expiry ? new Date(expiry).toISOString() : null,
        quantityInBaseUnits: Number(qty) || 0,
        purchasePricePerBaseUnit: cost.trim() ? Number(cost) : null,
      });
      await runSync();
      navigate(`/products/${productId}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not receive stock.");
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
          <h2 className="text-lg font-bold text-text-primary">Receive stock</h2>
          <p className="text-sm text-text-secondary">{product?.name ?? ""}</p>
        </div>
        <TextField label="Batch number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
        <TextField label="Expiry date (required)" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <TextField label="Quantity (base units)" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        <TextField label="Unit cost (optional)" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button onClick={submit} loading={busy} disabled={!batchNumber.trim() || !expiry || Number(qty) <= 0}>
          Receive
        </Button>
      </div>
    </div>
  );
}
