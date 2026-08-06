import type { SelectOption } from "@/components/SearchableSelect";

/** All African currencies plus the major global reserve currencies. `label`
 * carries the name + symbol so the in-dropdown search matches on either. The
 * stored value stays the ISO code (what the rest of the app formats with). */
interface Cur {
  code: string;
  name: string;
}

const AFRICAN: Cur[] = [
  { code: "XAF", name: "Central African CFA franc" },
  { code: "XOF", name: "West African CFA franc" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "GHS", name: "Ghanaian cedi" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "ZAR", name: "South African rand" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "MAD", name: "Moroccan dirham" },
  { code: "DZD", name: "Algerian dinar" },
  { code: "TND", name: "Tunisian dinar" },
  { code: "ETB", name: "Ethiopian birr" },
  { code: "UGX", name: "Ugandan shilling" },
  { code: "TZS", name: "Tanzanian shilling" },
  { code: "RWF", name: "Rwandan franc" },
  { code: "CDF", name: "Congolese franc" },
  { code: "AOA", name: "Angolan kwanza" },
  { code: "MZN", name: "Mozambican metical" },
  { code: "ZMW", name: "Zambian kwacha" },
  { code: "BWP", name: "Botswana pula" },
  { code: "NAD", name: "Namibian dollar" },
  { code: "MUR", name: "Mauritian rupee" },
  { code: "SCR", name: "Seychellois rupee" },
  { code: "GMD", name: "Gambian dalasi" },
  { code: "GNF", name: "Guinean franc" },
  { code: "MWK", name: "Malawian kwacha" },
  { code: "SLL", name: "Sierra Leonean leone" },
  { code: "LRD", name: "Liberian dollar" },
  { code: "SDG", name: "Sudanese pound" },
  { code: "SSP", name: "South Sudanese pound" },
  { code: "LYD", name: "Libyan dinar" },
  { code: "SOS", name: "Somali shilling" },
  { code: "MRU", name: "Mauritanian ouguiya" },
  { code: "CVE", name: "Cape Verdean escudo" },
  { code: "BIF", name: "Burundian franc" },
  { code: "DJF", name: "Djiboutian franc" },
  { code: "ERN", name: "Eritrean nakfa" },
  { code: "SZL", name: "Eswatini lilangeni" },
  { code: "LSL", name: "Lesotho loti" },
  { code: "MGA", name: "Malagasy ariary" },
  { code: "KMF", name: "Comorian franc" },
  { code: "STN", name: "São Tomé and Príncipe dobra" },
];

const FOREIGN: Cur[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CHF", name: "Swiss franc" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "INR", name: "Indian rupee" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "TRY", name: "Turkish lira" },
  { code: "BRL", name: "Brazilian real" },
];

/** Options for the SearchableSelect: value = ISO code, label = "CODE — Name". */
export const CURRENCY_OPTIONS: SelectOption[] = [...AFRICAN, ...FOREIGN].map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
  sublabel: undefined,
}));
