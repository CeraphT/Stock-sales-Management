import type { ReactNode } from "react";

import { SearchableSelect } from "@/components/SearchableSelect";
import { TextField } from "@/components/TextField";
import { BUSINESS_PRESETS, CAPABILITY_META } from "@/lib/businessTypes";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { useT } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs";
import { readImageAsDataUrl } from "@/lib/readImage";
import { toast } from "@/lib/toast";

import type { CompanyForm } from "./useCompanyForm";

/* The "My business" fields, cut into blocks so the settings tabs and the
 * shop-creation wizard steps can arrange them differently while editing the
 * same form state (see useCompanyForm). */

const selectCls = "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</span>;
}

/** Business type: pre-selects the inventory features that type of business needs. */
export function BusinessTypeSection({ f, selected, onSelect }: { f: CompanyForm; selected: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  return (
    <div>
      <FieldLabel>{t("Type of business")}</FieldLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUSINESS_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onSelect(p.id);
              f.setCapabilities(p.caps);
            }}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
              selected === p.id ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-text-primary hover:bg-background"
            }`}
          >
            <span className="text-lg" aria-hidden>{p.icon}</span>
            <span className="leading-tight">{t(p.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Logo + business name. */
export function IdentitySection({ f, nameLabel }: { f: CompanyForm; nameLabel?: string }) {
  const t = useT();
  async function onLogoPick(file: File | undefined) {
    if (!file) return;
    try {
      f.setLogoUrl(await readImageAsDataUrl(file, 256));
    } catch {
      toast(t("Could not read that image."), "error");
    }
  }
  return (
    <>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
          {f.logoUrl ? <img src={f.logoUrl} alt="logo" className="h-full w-full object-contain" /> : <span className="text-2xl">🏢</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Business logo")}</span>
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-primary">
              {t("Upload")}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0])} />
            </label>
            {f.logoUrl ? (
              <button type="button" onClick={() => f.setLogoUrl(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10">
                {t("Remove")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <TextField label={nameLabel ?? t("Business name")} value={f.name} onChange={(e) => f.setName(e.target.value)} />
    </>
  );
}

/** Description, address, phone, receipt footer, NIU. */
export function ContactSection({ f }: { f: CompanyForm }) {
  const t = useT();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("Address")} value={f.address} onChange={(e) => f.setAddress(e.target.value)} placeholder={t("Shown on receipts & purchase orders")} />
        <TextField label={t("Phone")} value={f.phone} onChange={(e) => f.setPhone(e.target.value)} />
        <TextField label={t("Taxpayer number (NIU)")} value={f.taxId} onChange={(e) => f.setTaxId(e.target.value)} placeholder={t("Your NIU. Shown on tax invoices")} />
        <TextField label={t("Receipt footer message")} value={f.receiptFooter} onChange={(e) => f.setReceiptFooter(e.target.value)} placeholder={t("e.g. Thank you for your business!")} />
      </div>
      <TextField label={t("Description")} value={f.description} onChange={(e) => f.setDescription(e.target.value)} />
    </>
  );
}

/** Country (sets currency + VAT) and the resulting currency. */
export function CountrySection({ f }: { f: CompanyForm }) {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <FieldLabel>{t("Country")}</FieldLabel>
        <SearchableSelect value={f.country} options={COUNTRY_OPTIONS} onChange={f.setCountry} placeholder={t("Select your country…")} />
        <p className="mt-1 text-xs text-text-secondary">{t("Sets the currency and default tax rate automatically.")}</p>
      </label>
      <label className="block">
        <FieldLabel>{t("Currency")}</FieldLabel>
        <div className="flex h-10 w-full items-center rounded-xl border border-border bg-background/60 px-3 text-sm text-text-secondary">
          {f.currencyLabel || "-"}
        </div>
      </label>
    </div>
  );
}

/** Accounting system, tax regime, VAT rate or flat tax. */
export function TaxSection({ f }: { f: CompanyForm }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <label className="block">
          <FieldLabel>{t("Accounting system")}</FieldLabel>
          <select value={f.accountingSystem} onChange={(e) => f.setAccountingSystem(Number(e.target.value))} className={selectCls}>
            <option value={0}>{t("OHADA / SYSCOHADA (Central & West Africa)")}</option>
            <option value={1}>{t("Generic VAT")}</option>
            <option value={2}>{t("No sales tax")}</option>
          </select>
          <p className="mt-1 text-xs text-text-secondary">
            {t("Sets which tax declaration the business produces. OHADA uses SYSCOHADA account codes; Generic VAT drops them; No sales tax hides the declaration.")}
          </p>
        </label>

        <div>
          <FieldLabel>{t("Tax regime")}</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 0, label: t("Standard (collects VAT)"), hint: t("Régime du réel/simplifié") },
              { v: 1, label: t("Flat tax (impôt libératoire)"), hint: t("Very small business. No VAT") },
            ].map((r) => (
              <button
                key={r.v}
                type="button"
                onClick={() => {
                  f.setTaxRegime(r.v);
                  if (r.v === 1) f.setTax("0");
                  else if (Number(f.tax) <= 0) f.toggleTax(true);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${f.taxRegime === r.v ? "border-primary bg-primary/10" : "border-border hover:bg-background"}`}
              >
                <div className="font-semibold text-text-primary">{r.label}</div>
                <div className="text-[11px] text-text-secondary">{r.hint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {f.taxRegime === 0 ? (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.taxOn} onChange={(e) => f.toggleTax(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-semibold text-text-primary">🧾 {t("Apply VAT (TVA) on sales")}</span>
            </label>
            {f.taxOn ? (
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("VAT rate %")}</span>
                <input
                  type="number"
                  value={f.tax}
                  onChange={(e) => f.setTax(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-text-secondary">
            {t("When on, every sale extracts the VAT portion (prices are VAT-inclusive) and it shows on receipts, reports and the tax declaration. Turn off if your business doesn't charge VAT.")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-xs text-text-secondary">
            {t("Under impôt libératoire you charge no VAT; instead you pay a flat lump-sum tax set by your commune. Enter it below. It appears in the tax declaration.")}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <TextField label={`${t("Flat tax amount")} (${f.currencyLabel})`} type="number" value={f.flatTaxAmount} onChange={(e) => f.setFlatTaxAmount(e.target.value)} />
            <label className="block">
              <FieldLabel>{t("Period")}</FieldLabel>
              <select value={f.flatTaxPeriod} onChange={(e) => f.setFlatTaxPeriod(Number(e.target.value))} className={selectCls}>
                <option value={0}>{t("Monthly")}</option>
                <option value={1}>{t("Quarterly")}</option>
                <option value={2}>{t("Yearly")}</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Purchase-reward gift cards. */
export function RewardsSection({ f }: { f: CompanyForm }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border p-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={f.rewardEnabled} onChange={(e) => f.setRewardEnabled(e.target.checked)} className="h-4 w-4" />
        <span className="text-sm font-semibold text-text-primary">🎁 {t("Purchase-reward gift cards")}</span>
      </label>
      <p className="mt-1 text-xs text-text-secondary">
        {t("Every Nth completed purchase, the customer earns a fixed-value gift card. The cashier is prompted at checkout to issue and print it.")}
      </p>
      {f.rewardEnabled ? (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <TextField label={t("Reward every N purchases")} type="number" value={f.rewardCount} onChange={(e) => f.setRewardCount(e.target.value)} />
          <TextField label={`${t("Gift card value")} (${f.currencyLabel})`} type="number" value={f.rewardValue} onChange={(e) => f.setRewardValue(e.target.value)} />
        </div>
      ) : null}
    </div>
  );
}

/** Inventory features (capabilities). */
export function CapabilitiesSection({ f }: { f: CompanyForm }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">
        {t("Turn on only the inventory features this business needs. The rest stay hidden so the app stays simple.")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {CAPABILITY_META.map((c) => (
        <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-background">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={f.capabilities[c.key]}
            onChange={(e) => f.setCapabilities((prev) => ({ ...prev, [c.key]: e.target.checked }))}
          />
          <span>
            <span className="block text-sm font-semibold text-text-primary">{t(c.label)}</span>
            <span className="block text-xs text-text-secondary">{t(c.desc)}</span>
          </span>
        </label>
      ))}
      </div>
    </div>
  );
}

/** Low-stock default + the per-device "products without supplier" rule. */
export function RulesSection({ f }: { f: CompanyForm }) {
  const t = useT();
  const allowNoSupplier = usePrefsStore((s) => s.allowProductsWithoutSupplier);
  const setPref = usePrefsStore((s) => s.set);
  return (
    <>
      <TextField
        label={t("Default low-stock threshold")}
        type="number"
        value={f.lowStock}
        onChange={(e) => f.setLowStock(e.target.value)}
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
  );
}
