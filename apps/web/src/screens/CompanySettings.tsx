import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TextField } from "@/components/TextField";
import { CAPABILITY_META } from "@/lib/businessTypes";
import { confirmDialog } from "@/lib/confirm";
import { DEFAULT_CAPABILITIES } from "@/lib/useCapabilities";
import type { InventoryCapabilities } from "@stockflow/core/api/types/auth";
import { COUNTRY_INFO, COUNTRY_OPTIONS, countryForCurrency } from "@/lib/countries";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useT } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs";
import { queryClient } from "@/lib/queryClient";
import { readImageAsDataUrl } from "@/lib/readImage";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";

type Tab = "business" | "tax" | "rewards" | "manage" | "rules";

export function CompanySettings() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const allowNoSupplier = usePrefsStore((s) => s.allowProductsWithoutSupplier);
  const setPref = usePrefsStore((s) => s.set);
  const t = useT();

  const { data: company } = useQuery({ queryKey: ["company-settings", companyId], queryFn: () => companiesApi.get(companyId) });

  const [tab, setTab] = useState<Tab>("business");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [currency, setCurrency] = useState("");
  const [tax, setTax] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardCount, setRewardCount] = useState("");
  const [rewardValue, setRewardValue] = useState("");
  const [taxRegime, setTaxRegime] = useState(0);
  const [flatTaxAmount, setFlatTaxAmount] = useState("");
  const [flatTaxPeriod, setFlatTaxPeriod] = useState(1);
  const [accountingSystem, setAccountingSystem] = useState(0);
  const [capabilities, setCapabilities] = useState<InventoryCapabilities>(DEFAULT_CAPABILITIES);
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!company) return;
    setName(company.name);
    setDescription(company.description ?? "");
    setAddress(company.address ?? "");
    setPhone(company.phone ?? "");
    setReceiptFooter(company.receiptFooter ?? "");
    setCompanyTaxId(company.taxId ?? "");
    setLogoUrl(company.logoUrl ?? null);
    setCurrency(company.currency);
    setTax(String(company.defaultTaxRatePercent));
    setLowStock(String(company.defaultLowStockThreshold));
    setRewardEnabled(company.rewardProgramEnabled);
    setRewardCount(String(company.rewardPurchaseCount));
    setRewardValue(String(company.rewardGiftCardValue));
    setTaxRegime(company.taxRegime);
    setFlatTaxAmount(String(company.flatTaxAmount));
    setFlatTaxPeriod(company.flatTaxPeriod);
    setAccountingSystem(company.accountingSystem ?? 0);
    setCapabilities(company.capabilities ?? DEFAULT_CAPABILITIES);
    setCountry(countryForCurrency(company.currency) ?? "");
  }, [company]);

  const currencyLabel = CURRENCY_OPTIONS.find((o) => o.value === currency)?.label ?? currency;

  // VAT is "on" iff the rate is > 0. Toggling remembers the last non-zero rate
  // so turning it back on restores the exact percentage.
  const taxOn = Number(tax) > 0;
  const lastTaxRate = useRef("19.25");
  useEffect(() => {
    if (Number(tax) > 0) lastTaxRate.current = tax;
  }, [tax]);
  function toggleTax(on: boolean) {
    if (!on) {
      setTax("0");
      return;
    }
    const countryVat = COUNTRY_INFO[country]?.vat;
    setTax(Number(lastTaxRate.current) > 0 ? lastTaxRate.current : countryVat ? String(countryVat) : "19.25");
  }

  async function onLogoPick(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file, 256);
      setLogoUrl(dataUrl);
    } catch {
      toast(t("Could not read that image."), "error");
    }
  }

  async function convert() {
    if (converting || !company) return;
    const ok = await confirmDialog({
      title: t("Convert currency"),
      message: `${company.currency} → ${currency}. ${t("Product prices, batch costs, customer credit, loyalty & gift-card balances will be recalculated at today's rate. Past sales and cash-register history are NOT changed. Needs an internet connection.")}`,
      confirmLabel: t("Convert"),
    });
    if (!ok) return;
    setConverting(true);
    try {
      const r = await companiesApi.convertCurrency(companyId, currency);
      await runSync();
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      await queryClient.invalidateQueries();
      toast(`✓ ${r.fromCurrency}→${r.toCurrency} @ ${r.rate} · ${r.products} ${t("products")}, ${r.customers} ${t("customers")}, ${r.giftCards} ${t("gift cards")}`, "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Currency conversion failed."), "error");
    } finally {
      setConverting(false);
    }
  }

  async function save() {
    if (saving || !company) return;
    setSaving(true);
    try {
      await companiesApi.update(companyId, {
        name: name.trim(),
        description: description.trim() || null,
        currency: currency.trim() || "XAF",
        defaultTaxRatePercent: Number(tax) || 0,
        // Loyalty points are hidden but preserved as-is.
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
        defaultLowStockThreshold: Number(lowStock) || 0,
        setupCompleted: company.setupCompleted,
        taxRegime,
        flatTaxAmount: Number(flatTaxAmount) || 0,
        flatTaxPeriod,
        taxId: companyTaxId.trim() || null,
        accountingSystem,
        capabilities,
      });
      await runSync();
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      toast(t("Settings saved."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not save settings."), "error");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "business", label: t("Business"), icon: "🏢" },
    { id: "tax", label: t("Tax & currency"), icon: "💱" },
    { id: "rewards", label: t("Loyalty & rewards"), icon: "🎁" },
    { id: "manage", label: t("What you manage"), icon: "📦" },
    { id: "rules", label: t("Data-entry rules"), icon: "📋" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              tab === x.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-surface"
            }`}
          >
            {x.icon} {x.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        {tab === "business" ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
              <div>
                <span className="block text-sm text-text-secondary">{t("Invite code")}</span>
                <span className="text-[11px] text-text-secondary">{t("Share this so a teammate can join your company.")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-text-primary">{company?.uniqueCode ?? "…"}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!company?.uniqueCode) return;
                    try {
                      await navigator.clipboard.writeText(company.uniqueCode);
                      toast(t("Invite code copied."), "success");
                    } catch {
                      toast(t("Could not copy — copy it manually."), "error");
                    }
                  }}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-primary transition hover:border-primary"
                >
                  📋 {t("Copy")}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
                {logoUrl ? <img src={logoUrl} alt="logo" className="h-full w-full object-contain" /> : <span className="text-2xl">🏢</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Business logo")}</span>
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-primary">
                    {t("Upload")}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0])} />
                  </label>
                  {logoUrl ? (
                    <button onClick={() => setLogoUrl(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10">
                      {t("Remove")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <TextField label={t("Business name")} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t("Description")} value={description} onChange={(e) => setDescription(e.target.value)} />
            <TextField label={t("Address")} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("Shown on receipts & purchase orders")} />
            <TextField label={t("Phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <TextField label={t("Receipt footer message")} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder={t("e.g. Thank you for your business!")} />
            <TextField label={t("Taxpayer number (NIU)")} value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} placeholder={t("Your NIU — shown on tax invoices")} />
          </>
        ) : null}

        {tab === "tax" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Country")}</span>
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
              <p className="mt-1 text-xs text-text-secondary">{t("Sets the currency and default tax rate automatically.")}</p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Currency")}</span>
              <div className="flex h-10 w-full items-center rounded-xl border border-border bg-background/60 px-3 text-sm text-text-secondary">
                {currencyLabel || "—"}
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Accounting system")}</span>
              <select
                value={accountingSystem}
                onChange={(e) => setAccountingSystem(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value={0}>{t("OHADA / SYSCOHADA (Central & West Africa)")}</option>
                <option value={1}>{t("Generic VAT")}</option>
                <option value={2}>{t("No sales tax")}</option>
              </select>
              <p className="mt-1 text-xs text-text-secondary">
                {t("Sets which tax declaration the business produces. OHADA uses SYSCOHADA account codes; Generic VAT drops them; No sales tax hides the declaration.")}
              </p>
            </label>

            <div className="rounded-xl border border-border p-4">
              <div className="mb-1 text-sm font-semibold text-text-primary">{t("Tax regime")}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { v: 0, label: t("Standard (collects VAT)"), hint: t("Régime du réel/simplifié") },
                  { v: 1, label: t("Flat tax (impôt libératoire)"), hint: t("Very small business — no VAT") },
                ].map((r) => (
                  <button
                    key={r.v}
                    type="button"
                    onClick={() => {
                      setTaxRegime(r.v);
                      if (r.v === 1) setTax("0");
                      else if (Number(tax) <= 0) toggleTax(true);
                    }}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      taxRegime === r.v ? "border-primary bg-primary/10" : "border-border hover:bg-background"
                    }`}
                  >
                    <div className="font-semibold text-text-primary">{r.label}</div>
                    <div className="text-[11px] text-text-secondary">{r.hint}</div>
                  </button>
                ))}
              </div>

              {taxRegime === 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={taxOn} onChange={(e) => toggleTax(e.target.checked)} className="h-4 w-4" />
                    <span className="text-sm font-semibold text-text-primary">🧾 {t("Apply VAT (TVA) on sales")}</span>
                  </label>
                  <p className="mt-1 text-xs text-text-secondary">
                    {t("When on, every sale extracts the VAT portion (prices are VAT-inclusive) and it shows on receipts, reports and the tax declaration. Turn off if your business doesn't charge VAT.")}
                  </p>
                  {taxOn ? (
                    <div className="mt-3 max-w-[12rem]">
                      <TextField label={t("VAT rate %")} type="number" value={tax} onChange={(e) => setTax(e.target.value)} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-3 text-xs text-text-secondary">
                    {t("Under impôt libératoire you charge no VAT; instead you pay a flat lump-sum tax set by your commune. Enter it below — it appears in the tax declaration.")}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField label={`${t("Flat tax amount")} (${currencyLabel})`} type="number" value={flatTaxAmount} onChange={(e) => setFlatTaxAmount(e.target.value)} />
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Period")}</span>
                      <select value={flatTaxPeriod} onChange={(e) => setFlatTaxPeriod(Number(e.target.value))} className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary">
                        <option value={0}>{t("Monthly")}</option>
                        <option value={1}>{t("Quarterly")}</option>
                        <option value={2}>{t("Yearly")}</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {company && currency !== company.currency ? (
              <div className="rounded-lg bg-accent-amber/10 px-3 py-2.5 text-xs text-accent-amber">
                <p>⚠ {t("Changing the currency only relabels amounts — existing prices and balances keep their numbers and are NOT converted to")} {currency}.</p>
                <button
                  type="button"
                  onClick={convert}
                  disabled={converting}
                  className="mt-1.5 rounded-lg bg-accent-amber/20 px-2.5 py-1 font-bold text-accent-amber transition hover:bg-accent-amber/30 disabled:opacity-50"
                >
                  {converting ? t("Converting…") : `🔄 ${t("Convert prices & balances at today's rate")}`}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "rewards" ? (
          <div className="rounded-xl border border-border p-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rewardEnabled} onChange={(e) => setRewardEnabled(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-semibold text-text-primary">🎁 {t("Purchase-reward gift cards")}</span>
            </label>
            <p className="mt-1 text-xs text-text-secondary">
              {t("Every Nth completed purchase, the customer earns a fixed-value gift card. The cashier is prompted at checkout to issue and print it.")}
            </p>
            {rewardEnabled ? (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <TextField label={t("Reward every N purchases")} type="number" value={rewardCount} onChange={(e) => setRewardCount(e.target.value)} />
                <TextField label={`${t("Gift card value")} (${currencyLabel})`} type="number" value={rewardValue} onChange={(e) => setRewardValue(e.target.value)} />
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "manage" ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              {t("Turn on only the inventory features this business needs — the rest stay hidden so the app stays simple.")}
            </p>
            {CAPABILITY_META.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-background">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={capabilities[c.key]}
                  onChange={(e) => setCapabilities((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{t(c.label)}</span>
                  <span className="block text-xs text-text-secondary">{t(c.desc)}</span>
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {tab === "rules" ? (
          <>
            <TextField
              label={t("Default low-stock threshold")}
              type="number"
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
              placeholder={t("Prefilled on new products")}
            />
            <label className="flex items-start gap-3 rounded-xl border border-border p-4">
              <input
                type="checkbox"
                checked={allowNoSupplier}
                onChange={(e) => {
                  setPref("allowProductsWithoutSupplier", e.target.checked);
                  toast(e.target.checked ? t("Products can now be saved without a supplier.") : t("A supplier is now required on products."), "info");
                }}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-semibold text-text-primary">{t("Allow products without a supplier")}</span>
                <span className="block text-xs text-text-secondary">
                  {t("Off by default: every product must be linked to a supplier. Turn on to register existing stock whose supplier is unknown.")}
                </span>
              </span>
            </label>
            <p className="text-xs text-text-secondary">{t("The supplier rule applies to this device; other settings apply company-wide.")}</p>
          </>
        ) : null}

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            {t("Save settings")}
          </Button>
        </div>
      </div>
    </div>
  );
}
