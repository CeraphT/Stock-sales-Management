/** Same shape as the web/desktop SearchableSelect option. */
export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/** Country → its currency (ISO code) + standard VAT/sales-tax rate. Selecting a
 * country drives both the company currency and the default tax %, so those two
 * fields don't have to be set by hand. Rates are the standard national VAT
 * (indicative — still editable). African countries first, then major others. */
interface Country {
  name: string;
  /** French display name (the English `name` stays the stable value). */
  fr: string;
  currency: string;
  vat: number;
}

const COUNTRIES: Country[] = [
  { name: "Cameroon", fr: "Cameroun", currency: "XAF", vat: 19.25 },
  { name: "Nigeria", fr: "Nigeria", currency: "NGN", vat: 7.5 },
  { name: "Ghana", fr: "Ghana", currency: "GHS", vat: 15 },
  { name: "Kenya", fr: "Kenya", currency: "KES", vat: 16 },
  { name: "South Africa", fr: "Afrique du Sud", currency: "ZAR", vat: 15 },
  { name: "Côte d'Ivoire", fr: "Côte d'Ivoire", currency: "XOF", vat: 18 },
  { name: "Senegal", fr: "Sénégal", currency: "XOF", vat: 18 },
  { name: "Mali", fr: "Mali", currency: "XOF", vat: 18 },
  { name: "Burkina Faso", fr: "Burkina Faso", currency: "XOF", vat: 18 },
  { name: "Benin", fr: "Bénin", currency: "XOF", vat: 18 },
  { name: "Togo", fr: "Togo", currency: "XOF", vat: 18 },
  { name: "Gabon", fr: "Gabon", currency: "XAF", vat: 18 },
  { name: "Congo", fr: "Congo", currency: "XAF", vat: 18 },
  { name: "DR Congo", fr: "RD Congo", currency: "CDF", vat: 16 },
  { name: "Chad", fr: "Tchad", currency: "XAF", vat: 18 },
  { name: "Central African Republic", fr: "République centrafricaine", currency: "XAF", vat: 19 },
  { name: "Egypt", fr: "Égypte", currency: "EGP", vat: 14 },
  { name: "Morocco", fr: "Maroc", currency: "MAD", vat: 20 },
  { name: "Algeria", fr: "Algérie", currency: "DZD", vat: 19 },
  { name: "Tunisia", fr: "Tunisie", currency: "TND", vat: 19 },
  { name: "Ethiopia", fr: "Éthiopie", currency: "ETB", vat: 15 },
  { name: "Tanzania", fr: "Tanzanie", currency: "TZS", vat: 18 },
  { name: "Uganda", fr: "Ouganda", currency: "UGX", vat: 18 },
  { name: "Rwanda", fr: "Rwanda", currency: "RWF", vat: 18 },
  { name: "Zambia", fr: "Zambie", currency: "ZMW", vat: 16 },
  { name: "Angola", fr: "Angola", currency: "AOA", vat: 14 },
  { name: "Mozambique", fr: "Mozambique", currency: "MZN", vat: 16 },
  { name: "Botswana", fr: "Botswana", currency: "BWP", vat: 14 },
  { name: "Namibia", fr: "Namibie", currency: "NAD", vat: 15 },
  { name: "Mauritius", fr: "Maurice", currency: "MUR", vat: 15 },
  { name: "Madagascar", fr: "Madagascar", currency: "MGA", vat: 20 },
  { name: "France", fr: "France", currency: "EUR", vat: 20 },
  { name: "United Kingdom", fr: "Royaume-Uni", currency: "GBP", vat: 20 },
  { name: "Germany", fr: "Allemagne", currency: "EUR", vat: 19 },
  { name: "Spain", fr: "Espagne", currency: "EUR", vat: 21 },
  { name: "Italy", fr: "Italie", currency: "EUR", vat: 22 },
  { name: "United States", fr: "États-Unis", currency: "USD", vat: 0 },
  { name: "Canada", fr: "Canada", currency: "CAD", vat: 5 },
  { name: "China", fr: "Chine", currency: "CNY", vat: 13 },
  { name: "India", fr: "Inde", currency: "INR", vat: 18 },
  { name: "United Arab Emirates", fr: "Émirats arabes unis", currency: "AED", vat: 5 },
  { name: "Saudi Arabia", fr: "Arabie saoudite", currency: "SAR", vat: 15 },
];

/** value = country name (unique); label = "Country · CUR · VAT%". */
export const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map((c) => ({
  value: c.name,
  label: `${c.name} · ${c.currency} · ${c.vat}%`,
  sublabel: undefined,
}));

/** COUNTRY_OPTIONS with the label in the app language; value stays the English name. */
export function countryOptions(language: "en" | "fr"): SelectOption[] {
  if (language === "en") return COUNTRY_OPTIONS;
  return COUNTRIES.map((c) => ({ value: c.name, label: `${c.fr} · ${c.currency} · ${c.vat}%`, sublabel: undefined }));
}

/** Country name → { currency, vat } for driving the currency + tax fields. */
export const COUNTRY_INFO: Record<string, { currency: string; vat: number }> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name, { currency: c.currency, vat: c.vat }]),
);

/** Reverse lookup: first country whose currency matches (for prefilling the
 * country dropdown from the company's saved currency). */
export function countryForCurrency(currency: string): string | null {
  return COUNTRIES.find((c) => c.currency === currency)?.name ?? null;
}
