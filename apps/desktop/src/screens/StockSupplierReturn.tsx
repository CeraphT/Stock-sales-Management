import { ApiError } from "@stockflow/core/api/client";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { runSync } from "@/lib/sync/runSync";
import { useAuthStore } from "@/lib/stores";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary";

export function StockSupplierReturn() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;
  const t = useT();

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
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batch = batches.find((b) => b.id === batchId);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await productsApi.supplierReturn(companyId, productId!, {
        batchId,
        quantityInBaseUnits: Number(qty) || 0,
        reason: reason.trim() || null,
      });
      await runSync();
      navigate(`/products/${productId}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not return stock.");
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
          <h2 className="text-lg font-bold text-text-primary">{t("Return to supplier")}</h2>
          <p className="text-sm text-text-secondary">{product?.name ?? ""}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Batch")}</span>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={selectCls}>
            <option value="">{t("— select batch —")}</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchNumber} · {b.quantityInBaseUnits} {t("in stock")}
                {b.expiryDate ? ` · exp ${b.expiryDate.slice(0, 10)}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div>
          <TextField
            label={t("Quantity to return (base units)")}
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
          {batch ? <p className="mt-1 text-xs text-text-secondary">{batch.quantityInBaseUnits} {t("in stock")}</p> : null}
        </div>
        <TextField label={t("Reason (optional)")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. damaged / expired / wrong item")} />

        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button
          onClick={submit}
          loading={busy}
          disabled={!batchId || Number(qty) <= 0 || (batch != null && Number(qty) > batch.quantityInBaseUnits)}
        >
          {t("Return to supplier")}
        </Button>
      </div>
    </div>
  );
}
