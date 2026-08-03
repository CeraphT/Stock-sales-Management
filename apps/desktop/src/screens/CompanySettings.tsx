import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";

export function CompanySettings() {
  const companyId = useAuthStore((s) => s.companyId)!;

  const { data: company } = useQuery({ queryKey: ["company-settings", companyId], queryFn: () => companiesApi.get(companyId) });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("");
  const [tax, setTax] = useState("");
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [earnRate, setEarnRate] = useState("");
  const [pointValue, setPointValue] = useState("");
  const [servicesEnabled, setServicesEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!company) return;
    setName(company.name);
    setDescription(company.description ?? "");
    setCurrency(company.currency);
    setTax(String(company.defaultTaxRatePercent));
    setLoyaltyEnabled(company.loyaltyEnabled);
    setEarnRate(String(company.loyaltyEarnRateAmount));
    setPointValue(String(company.loyaltyPointValue));
    setServicesEnabled(company.servicesModuleEnabled);
  }, [company]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await companiesApi.update(companyId, {
        name: name.trim(),
        description: description.trim() || null,
        currency: currency.trim() || "XAF",
        defaultTaxRatePercent: Number(tax) || 0,
        loyaltyEnabled,
        loyaltyEarnRateAmount: Number(earnRate) || 0,
        loyaltyPointValue: Number(pointValue) || 0,
        servicesModuleEnabled: servicesEnabled,
      });
      await runSync(); // refresh the local company row (currency etc.)
      setMsg({ ok: true, text: "Settings saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
          <span className="text-sm text-text-secondary">Invite code</span>
          <span className="font-mono font-bold text-text-primary">{company?.uniqueCode ?? "…"}</span>
        </div>

        <TextField label="Business name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          <TextField label="Default tax %" type="number" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>

        <div className="rounded-xl border border-border p-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={loyaltyEnabled} onChange={(e) => setLoyaltyEnabled(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-semibold text-text-primary">Loyalty program enabled</span>
          </label>
          {loyaltyEnabled ? (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <TextField label="Earn 1 point per (amount)" type="number" value={earnRate} onChange={(e) => setEarnRate(e.target.value)} />
              <TextField label="Point value" type="number" value={pointValue} onChange={(e) => setPointValue(e.target.value)} />
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={servicesEnabled} onChange={(e) => setServicesEnabled(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-semibold text-text-primary">Services module enabled</span>
        </label>

        {msg ? <p className={`text-sm font-medium ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</p> : null}

        <div className="flex justify-end">
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
