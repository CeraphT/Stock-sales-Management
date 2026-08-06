import type { SelectOption } from "@/components/SearchableSelect";

/** Country → its currency (ISO code) + standard VAT/sales-tax rate. Selecting a
 * country drives both the company currency and the default tax %, so those two
 * fields don't have to be set by hand. Rates are the standard national VAT
 * (indicative — still editable). African countries first, then major others. */
interface Country {
  name: string;
  currency: string;
  vat: number;
}

const COUNTRIES: Country[] = [
  { name: "Cameroon", currency: "XAF", vat: 19.25 },
  { name: "Nigeria", currency: "NGN", vat: 7.5 },
  { name: "Ghana", currency: "GHS", vat: 15 },
  { name: "Kenya", currency: "KES", vat: 16 },
  { name: "South Africa", currency: "ZAR", vat: 15 },
  { name: "Côte d'Ivoire", currency: "XOF", vat: 18 },
  { name: "Senegal", currency: "XOF", vat: 18 },
  { name: "Mali", currency: "XOF", vat: 18 },
  { name: "Burkina Faso", currency: "XOF", vat: 18 },
  { name: "Benin", currency: "XOF", vat: 18 },
  { name: "Togo", currency: "XOF", vat: 18 },
  { name: "Gabon", currency: "XAF", vat: 18 },
  { name: "Congo", currency: "XAF", vat: 18 },
  { name: "DR Congo", currency: "CDF", vat: 16 },
  { name: "Chad", currency: "XAF", vat: 18 },
  { name: "Central African Republic", currency: "XAF", vat: 19 },
  { name: "Egypt", currency: "EGP", vat: 14 },
  { name: "Morocco", currency: "MAD", vat: 20 },
  { name: "Algeria", currency: "DZD", vat: 19 },
  { name: "Tunisia", currency: "TND", vat: 19 },
  { name: "Ethiopia", currency: "ETB", vat: 15 },
  { name: "Tanzania", currency: "TZS", vat: 18 },
  { name: "Uganda", currency: "UGX", vat: 18 },
  { name: "Rwanda", currency: "RWF", vat: 18 },
  { name: "Zambia", currency: "ZMW", vat: 16 },
  { name: "Angola", currency: "AOA", vat: 14 },
  { name: "Mozambique", currency: "MZN", vat: 16 },
  { name: "Botswana", currency: "BWP", vat: 14 },
  { name: "Namibia", currency: "NAD", vat: 15 },
  { name: "Mauritius", currency: "MUR", vat: 15 },
  { name: "Madagascar", currency: "MGA", vat: 20 },
  { name: "France", currency: "EUR", vat: 20 },
  { name: "United Kingdom", currency: "GBP", vat: 20 },
  { name: "Germany", currency: "EUR", vat: 19 },
  { name: "Spain", currency: "EUR", vat: 21 },
  { name: "Italy", currency: "EUR", vat: 22 },
  { name: "United States", currency: "USD", vat: 0 },
  { name: "Canada", currency: "CAD", vat: 5 },
  { name: "China", currency: "CNY", vat: 13 },
  { name: "India", currency: "INR", vat: 18 },
  { name: "United Arab Emirates", currency: "AED", vat: 5 },
  { name: "Saudi Arabia", currency: "SAR", vat: 15 },
];

/** value = country name (unique); label = "Country · CUR · VAT%". */
export const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map((c) => ({
  value: c.name,
  label: `${c.name} · ${c.currency} · ${c.vat}%`,
  sublabel: undefined,
}));

/** Country name → { currency, vat } for driving the currency + tax fields. */
export const COUNTRY_INFO: Record<string, { currency: string; vat: number }> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name, { currency: c.currency, vat: c.vat }]),
);

/** Reverse lookup: first country whose currency matches (for prefilling the
 * country dropdown from the company's saved currency). */
export function countryForCurrency(currency: string): string | null {
  return COUNTRIES.find((c) => c.currency === currency)?.name ?? null;
}
