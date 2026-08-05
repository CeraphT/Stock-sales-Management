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

export function StockReceive() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;
  const locationId = useAuthStore((s) => s.locationId)!;
  const t = useT();

  const { data: product } = useQuery({
    queryKey: ["product", companyId, productId],
    queryFn: () => productsApi.get(companyId, productId!),
    enabled: !!productId,
  });

  const [batchNumber, setBatchNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [levelId, setLevelId] = useState(""); // "" = base unit
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levels = product?.packagingLevels ?? [];
  const level = levels.find((l) => l.id === levelId);
  const unitsPer = level?.quantityInBaseUnits ?? 1; // base units per received unit
  const baseUnits = (Number(qty) || 0) * unitsPer;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await productsApi.receiveStock(companyId, productId!, {
        locationId,
        batchNumber: batchNumber.trim(),
        expiryDate: expiry ? new Date(expiry).toISOString() : null,
        // Received in the chosen unit (e.g. boxes) → converted to base units.
        quantityInBaseUnits: baseUnits,
        // Cost is entered per received unit; store it per base unit.
        purchasePricePerBaseUnit: cost.trim() ? Number(cost) / unitsPer : null,
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
          <h2 className="text-lg font-bold text-text-primary">{t("Receive stock")}</h2>
          <p className="text-sm text-text-secondary">{product?.name ?? ""}</p>
        </div>
        <TextField label={t("Batch number")} value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
        <TextField label={t("Expiry date (required)")} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />

        {levels.length > 0 ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Receive in")}</span>
            <select
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="">{t("Unit")}</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.unitName} ({l.quantityInBaseUnits} {t("units")})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div>
          <TextField label={level ? `${t("Quantity")} (${level.unitName})` : t("Quantity (base units)")} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          {level && Number(qty) > 0 ? <p className="mt-1 text-xs text-text-secondary">= {baseUnits} {t("base units")}</p> : null}
        </div>

        <TextField label={level ? `${t("Cost")} (${level.unitName}${t(", optional")})` : t("Unit cost (optional)")} type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button onClick={submit} loading={busy} disabled={!batchNumber.trim() || !expiry || Number(qty) <= 0}>
          {t("Receive")}
        </Button>
      </div>
    </div>
  );
}
