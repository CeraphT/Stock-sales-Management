import type { CompanyResponse, InventoryCapabilities, UpdateCompanyRequest } from "@stockflow/core/api/types/auth";
import { useEffect, useRef, useState } from "react";

import { COUNTRY_INFO, countryForCurrency } from "@/lib/countries";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { DEFAULT_CAPABILITIES } from "@/lib/useCapabilities";

/** Every "My business" field, as editable form state. Shared by the settings
 * screen (loaded from the company) and the shop-creation wizard (blank, or from
 * a business-type preset), so both read and save the exact same fields. */
export function useCompanyForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [taxId, setTaxId] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [country, setCountryState] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [tax, setTax] = useState("19.25");
  const [lowStock, setLowStock] = useState("5");
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardCount, setRewardCount] = useState("10");
  const [rewardValue, setRewardValue] = useState("0");
  const [taxRegime, setTaxRegime] = useState(0);
  const [flatTaxAmount, setFlatTaxAmount] = useState("0");
  const [flatTaxPeriod, setFlatTaxPeriod] = useState(1);
  const [accountingSystem, setAccountingSystem] = useState(0);
  const [capabilities, setCapabilities] = useState<InventoryCapabilities>(DEFAULT_CAPABILITIES);

  function load(company: CompanyResponse) {
    setName(company.name);
    setDescription(company.description ?? "");
    setAddress(company.address ?? "");
    setPhone(company.phone ?? "");
    setReceiptFooter(company.receiptFooter ?? "");
    setTaxId(company.taxId ?? "");
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
    setCountryState(countryForCurrency(company.currency) ?? "");
  }

  /** Picking a country sets its currency and VAT rate. */
  function setCountry(nm: string) {
    setCountryState(nm);
    const info = COUNTRY_INFO[nm];
    if (info) {
      setCurrency(info.currency);
      setTax(String(info.vat));
    }
  }

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

  const currencyLabel = CURRENCY_OPTIONS.find((o) => o.value === currency)?.label ?? currency;

  /** The PUT/POST body. `keep` supplies the fields this form doesn't edit
   * (hidden loyalty points, services module, setup flag). */
  function toRequest(keep: Pick<UpdateCompanyRequest, "loyaltyEnabled" | "loyaltyEarnRateAmount" | "loyaltyPointValue" | "servicesModuleEnabled" | "setupCompleted">): UpdateCompanyRequest {
    return {
      name: name.trim(),
      description: description.trim() || null,
      currency: currency.trim() || "XAF",
      defaultTaxRatePercent: Number(tax) || 0,
      ...keep,
      rewardProgramEnabled: rewardEnabled,
      rewardPurchaseCount: Number(rewardCount) || 10,
      rewardGiftCardValue: Number(rewardValue) || 0,
      address: address.trim() || null,
      phone: phone.trim() || null,
      receiptFooter: receiptFooter.trim() || null,
      logoUrl: logoUrl || null,
      defaultLowStockThreshold: Number(lowStock) || 0,
      taxRegime,
      flatTaxAmount: Number(flatTaxAmount) || 0,
      flatTaxPeriod,
      taxId: taxId.trim() || null,
      accountingSystem,
      capabilities,
    };
  }

  return {
    name, setName, description, setDescription, address, setAddress, phone, setPhone,
    receiptFooter, setReceiptFooter, taxId, setTaxId, logoUrl, setLogoUrl,
    country, setCountry, currency, setCurrency, currencyLabel, tax, setTax, taxOn, toggleTax,
    lowStock, setLowStock, rewardEnabled, setRewardEnabled, rewardCount, setRewardCount, rewardValue, setRewardValue,
    taxRegime, setTaxRegime, flatTaxAmount, setFlatTaxAmount, flatTaxPeriod, setFlatTaxPeriod,
    accountingSystem, setAccountingSystem, capabilities, setCapabilities,
    load, toRequest,
  };
}

export type CompanyForm = ReturnType<typeof useCompanyForm>;
