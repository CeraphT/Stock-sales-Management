import type { SelectOption } from "@/lib/countries";


/** All African currencies plus the major global reserve currencies. `label`
 * carries the name + symbol so the in-dropdown search matches on either. The
 * stored value stays the ISO code (what the rest of the app formats with). */
interface Cur {
  code: string;
  name: string;
  fr: string;
}

const AFRICAN: Cur[] = [
  { code: "XAF", name: "Central African CFA franc", fr: "Franc CFA (BEAC)" },
  { code: "XOF", name: "West African CFA franc", fr: "Franc CFA (BCEAO)" },
  { code: "NGN", name: "Nigerian naira", fr: "Naira nigérian" },
  { code: "GHS", name: "Ghanaian cedi", fr: "Cedi ghanéen" },
  { code: "KES", name: "Kenyan shilling", fr: "Shilling kényan" },
  { code: "ZAR", name: "South African rand", fr: "Rand sud-africain" },
  { code: "EGP", name: "Egyptian pound", fr: "Livre égyptienne" },
  { code: "MAD", name: "Moroccan dirham", fr: "Dirham marocain" },
  { code: "DZD", name: "Algerian dinar", fr: "Dinar algérien" },
  { code: "TND", name: "Tunisian dinar", fr: "Dinar tunisien" },
  { code: "ETB", name: "Ethiopian birr", fr: "Birr éthiopien" },
  { code: "UGX", name: "Ugandan shilling", fr: "Shilling ougandais" },
  { code: "TZS", name: "Tanzanian shilling", fr: "Shilling tanzanien" },
  { code: "RWF", name: "Rwandan franc", fr: "Franc rwandais" },
  { code: "CDF", name: "Congolese franc", fr: "Franc congolais" },
  { code: "AOA", name: "Angolan kwanza", fr: "Kwanza angolais" },
  { code: "MZN", name: "Mozambican metical", fr: "Metical mozambicain" },
  { code: "ZMW", name: "Zambian kwacha", fr: "Kwacha zambien" },
  { code: "BWP", name: "Botswana pula", fr: "Pula du Botswana" },
  { code: "NAD", name: "Namibian dollar", fr: "Dollar namibien" },
  { code: "MUR", name: "Mauritian rupee", fr: "Roupie mauricienne" },
  { code: "SCR", name: "Seychellois rupee", fr: "Roupie seychelloise" },
  { code: "GMD", name: "Gambian dalasi", fr: "Dalasi gambien" },
  { code: "GNF", name: "Guinean franc", fr: "Franc guinéen" },
  { code: "MWK", name: "Malawian kwacha", fr: "Kwacha malawite" },
  { code: "SLL", name: "Sierra Leonean leone", fr: "Leone sierra-léonais" },
  { code: "LRD", name: "Liberian dollar", fr: "Dollar libérien" },
  { code: "SDG", name: "Sudanese pound", fr: "Livre soudanaise" },
  { code: "SSP", name: "South Sudanese pound", fr: "Livre sud-soudanaise" },
  { code: "LYD", name: "Libyan dinar", fr: "Dinar libyen" },
  { code: "SOS", name: "Somali shilling", fr: "Shilling somalien" },
  { code: "MRU", name: "Mauritanian ouguiya", fr: "Ouguiya mauritanien" },
  { code: "CVE", name: "Cape Verdean escudo", fr: "Escudo cap-verdien" },
  { code: "BIF", name: "Burundian franc", fr: "Franc burundais" },
  { code: "DJF", name: "Djiboutian franc", fr: "Franc djiboutien" },
  { code: "ERN", name: "Eritrean nakfa", fr: "Nakfa érythréen" },
  { code: "SZL", name: "Eswatini lilangeni", fr: "Lilangeni d'Eswatini" },
  { code: "LSL", name: "Lesotho loti", fr: "Loti du Lesotho" },
  { code: "MGA", name: "Malagasy ariary", fr: "Ariary malgache" },
  { code: "KMF", name: "Comorian franc", fr: "Franc comorien" },
  { code: "STN", name: "São Tomé and Príncipe dobra", fr: "Dobra de São Tomé-et-Principe" },
];

const FOREIGN: Cur[] = [
  { code: "USD", name: "US dollar", fr: "Dollar américain" },
  { code: "EUR", name: "Euro", fr: "Euro" },
  { code: "GBP", name: "British pound", fr: "Livre sterling" },
  { code: "CNY", name: "Chinese yuan", fr: "Yuan chinois" },
  { code: "JPY", name: "Japanese yen", fr: "Yen japonais" },
  { code: "CHF", name: "Swiss franc", fr: "Franc suisse" },
  { code: "CAD", name: "Canadian dollar", fr: "Dollar canadien" },
  { code: "AUD", name: "Australian dollar", fr: "Dollar australien" },
  { code: "INR", name: "Indian rupee", fr: "Roupie indienne" },
  { code: "AED", name: "UAE dirham", fr: "Dirham des Émirats" },
  { code: "SAR", name: "Saudi riyal", fr: "Riyal saoudien" },
  { code: "TRY", name: "Turkish lira", fr: "Livre turque" },
  { code: "BRL", name: "Brazilian real", fr: "Réal brésilien" },
];

/** Options for the SearchableSelect: value = ISO code, label = "CODE — Name". */
export const CURRENCY_OPTIONS: SelectOption[] = [...AFRICAN, ...FOREIGN].map((c) => ({
  value: c.code,
  label: `${c.code} - ${c.name}`,
  sublabel: undefined,
}));

/** "CODE - Name" in the app language, or the bare code if unknown. */
export function currencyLabel(code: string, language: "en" | "fr"): string {
  const c = [...AFRICAN, ...FOREIGN].find((x) => x.code === code);
  if (!c) return code;
  return `${c.code} - ${language === "fr" ? c.fr : c.name}`;
}
