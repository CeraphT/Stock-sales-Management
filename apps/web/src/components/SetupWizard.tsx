import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import type { CompanyResponse } from "@stockflow/core/api/types/auth";
import { useState } from "react";

import { Button } from "@/components/Button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TextField } from "@/components/TextField";
import { COUNTRY_INFO, COUNTRY_OPTIONS, countryForCurrency } from "@/lib/countries";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { readImageAsDataUrl } from "@/lib/readImage";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";

/**
 * Guided first-run setup shown to a business admin whose company hasn't been
 * configured yet (company.setupCompleted === false). Walks through location/tax,
 * business details, and optional rewards, then marks setup complete so it never
 * shows again. "Skip" also marks complete (with whatever's entered) so it can't
 * nag on every login.
 */
export function SetupWizard({ company, onDone }: { company: CompanyResponse; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [country, setCountry] = useState(countryForCurrency(company.currency) ?? "");
  const [currency, setCurrency] = useState(company.currency);
  const [tax, setTax] = useState(String(company.defaultTaxRatePercent));
  const [name, setName] = useState(company.name);
  const [address, setAddress] = useState(company.address ?? "");
  const [phone, setPhone] = useState(company.phone ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(company.logoUrl ?? null);
  const [receiptFooter, setReceiptFooter] = useState(company.receiptFooter ?? "");
  const [rewardEnabled, setRewardEnabled] = useState(company.rewardProgramEnabled);
  const [rewardCount, setRewardCount] = useState(String(company.rewardPurchaseCount || 10));
  const [rewardValue, setRewardValue] = useState(String(company.rewardGiftCardValue || 0));

  const currencyLabel = CURRENCY_OPTIONS.find((o) => o.value === currency)?.label ?? currency;

  async function onLogoPick(file: File | undefined) {
    if (!file) return;
    try {
      setLogoUrl(await readImageAsDataUrl(file, 256));
    } catch {
      toast(t("Could not read that image."), "error");
    }
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    try {
      await companiesApi.update(company.id, {
        name: name.trim() || company.name,
        description: company.description,
        currency: currency.trim() || "XAF",
        defaultTaxRatePercent: Number(tax) || 0,
        loyaltyEnabled: company.loyaltyEnabled,
        loyaltyEarnRateAmount: company.loyaltyEarnRateAmount,
        loyaltyPointValue: company.loyaltyPointValue,
        servicesModuleEnabled: company.servicesModuleEnabled,
        rewardProgramEnabled: rewardEnabled,
        rewardPurchaseCount: Number(rewardCount) || 10,
        rewardGiftCardValue: Number(rewardValue) || 0,
        address: address.trim() || null,
        phone: phone.trim() || null,
        receiptFooter: receiptFooter.trim() || null,
        logoUrl: logoUrl || null,
        defaultLowStockThreshold: company.defaultLowStockThreshold,
        setupCompleted: true,
        taxRegime: company.taxRegime,
        flatTaxAmount: company.flatTaxAmount,
        flatTaxPeriod: company.flatTaxPeriod,
        taxId: company.taxId,
      });
      await runSync().catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["company", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["company-settings", company.id] });
      toast(t("You're all set! You can fine-tune anything in Company settings."), "success");
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not save setup."), "error");
    } finally {
      setSaving(false);
    }
  }

  const STEPS = [t("Location & tax"), t("Business details"), t("Rewards")];

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="card-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-border bg-surface shadow-2xl">
        <div className="border-b border-border bg-primary/5 px-6 py-4">
          <div className="text-lg font-extrabold text-text-primary">👋 {t("Let's set up")} {company.name}</div>
          <div className="mt-2 flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          <div className="mt-1.5 text-xs font-semibold text-text-secondary">
            {t("Step")} {step + 1}/{STEPS.length} · {STEPS[step]}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <>
              <p className="text-sm text-text-secondary">{t("Pick your country — we'll set the currency and default tax rate for you.")}</p>
              <SearchableSelect
                value={country}
                options={COUNTRY_OPTIONS}
                onChange={(nm) => {
                  setCountry(nm);
                  const info = COUNTRY_INFO[nm];
                  if (info) {
                    setCurrency(info.currency);
                    setTax(String(info.vat));
                  }
                }}
                placeholder={t("Select your country…")}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Currency")}</div>
                  <div className="flex h-10 items-center rounded-xl border border-border bg-background/60 px-3 text-sm text-text-secondary">{currencyLabel || "—"}</div>
                </div>
                <TextField label={t("Default tax %")} type="number" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
                  {logoUrl ? <img src={logoUrl} alt="logo" className="h-full w-full object-contain" /> : <span className="text-2xl">🏢</span>}
                </div>
                <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-primary">
                  {t("Upload logo")}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0])} />
                </label>
              </div>
              <TextField label={t("Business name")} value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label={t("Address")} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("Shown on receipts & purchase orders")} />
              <TextField label={t("Phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <TextField label={t("Receipt footer message")} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder={t("e.g. Thank you for your business!")} />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-sm text-text-secondary">{t("Optional: reward loyal customers with a gift card every so many purchases. You can change this later.")}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={rewardEnabled} onChange={(e) => setRewardEnabled(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm font-semibold text-text-primary">🎁 {t("Purchase-reward gift cards")}</span>
              </label>
              {rewardEnabled ? (
                <div className="grid grid-cols-2 gap-4">
                  <TextField label={t("Reward every N purchases")} type="number" value={rewardCount} onChange={(e) => setRewardCount(e.target.value)} />
                  <TextField label={`${t("Gift card value")} (${currencyLabel})`} type="number" value={rewardValue} onChange={(e) => setRewardValue(e.target.value)} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button onClick={finish} disabled={saving} className="text-xs font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50">
            {t("Skip setup")}
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={saving}>
                {t("Back")}
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>{t("Next")}</Button>
            ) : (
              <Button onClick={finish} loading={saving}>
                {t("Finish setup")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
