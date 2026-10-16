import type { StarterKitRequest } from "../api/types/auth";

/* Starter content suggested per business type, created with a new shop (like
 * HouseBudget creates a house's units and categories). The creation wizard shows
 * these as editable lists in the shop language; the server only inserts what it
 * receives (StarterKitService). Shared by web, desktop and mobile. */

export type Lang = "en" | "fr";
export type BusinessTypeId = "general" | "pharmacy" | "grocery" | "electronics" | "fashion" | "food" | "workshop";

interface Txt { en: string; fr: string }
const tx = (en: string, fr: string): Txt => ({ en, fr });

interface DemoProduct {
  name: Txt;
  /** Index into the type's category list. */
  category: number;
  /** Prices in XAF per display unit (per kg for a measure product). */
  purchase: number;
  sale: number;
  measureUnit?: string;
  unitsPerMeasure?: number;
  packaging?: { unit: Txt; qty: number }[];
}

interface TypeKit {
  categories: Txt[];
  services: { name: Txt; category: Txt }[];
  demo: DemoProduct[];
  /** Default low-stock threshold prefilled on new products. */
  lowStock: number;
  /** Packaging unit names offered as quick chips in the product form. */
  packaging: Txt[];
}

const BOX = tx("Box", "Boîte");
const CARTON = tx("Carton", "Carton");
const PACK = tx("Pack", "Pack");

const KITS: Record<BusinessTypeId, TypeKit> = {
  general: {
    categories: [tx("Everyday products", "Produits courants"), tx("Accessories", "Accessoires"), tx("Consumables", "Consommables"), tx("Miscellaneous", "Divers")],
    services: [],
    demo: [
      { name: tx("Notebook 100 pages (sample)", "Cahier 100 pages (exemple)"), category: 0, purchase: 250, sale: 400, packaging: [{ unit: PACK, qty: 10 }] },
      { name: tx("Blue pen (sample)", "Stylo bleu (exemple)"), category: 0, purchase: 75, sale: 150, packaging: [{ unit: BOX, qty: 50 }] },
      { name: tx("AA batteries x4 (sample)", "Piles AA x4 (exemple)"), category: 2, purchase: 600, sale: 1000 },
    ],
    lowStock: 5,
    packaging: [CARTON, PACK, BOX],
  },
  pharmacy: {
    categories: [
      tx("Medicines", "Médicaments"), tx("Parapharmacy", "Parapharmacie"), tx("Hygiene & care", "Hygiène & soins"),
      tx("Baby & maternity", "Bébé & maternité"), tx("Medical equipment", "Matériel médical"), tx("Food supplements", "Compléments alimentaires"),
    ],
    services: [
      { name: tx("Blood pressure check", "Prise de tension"), category: tx("Care", "Soins") },
      { name: tx("Injection", "Injection"), category: tx("Care", "Soins") },
      { name: tx("Dressing", "Pansement"), category: tx("Care", "Soins") },
      { name: tx("Blood sugar test", "Test de glycémie"), category: tx("Tests", "Tests") },
      { name: tx("Consultation", "Consultation"), category: tx("Consultations", "Consultations") },
    ],
    demo: [
      { name: tx("Paracetamol 500 mg (sample)", "Paracétamol 500 mg (exemple)"), category: 0, purchase: 40, sale: 75, packaging: [{ unit: tx("Blister", "Plaquette"), qty: 10 }, { unit: BOX, qty: 20 }] },
      { name: tx("Oral rehydration salts (sample)", "Sels de réhydratation (exemple)"), category: 0, purchase: 150, sale: 250 },
      { name: tx("Hand sanitizer 100 ml (sample)", "Gel hydroalcoolique 100 ml (exemple)"), category: 2, purchase: 700, sale: 1200 },
      { name: tx("Baby diapers size 3 (sample)", "Couches bébé taille 3 (exemple)"), category: 3, purchase: 4500, sale: 6000 },
    ],
    lowStock: 10,
    packaging: [BOX, tx("Blister", "Plaquette"), tx("Bottle", "Flacon"), CARTON],
  },
  grocery: {
    categories: [
      tx("Dry groceries", "Épicerie sèche"), tx("Drinks", "Boissons"), tx("Fresh produce", "Produits frais"),
      tx("Dairy", "Produits laitiers"), tx("Hygiene & cleaning", "Hygiène & entretien"), tx("Snacks & sweets", "Snacks & confiserie"),
    ],
    services: [],
    demo: [
      { name: tx("Rice (sample)", "Riz (exemple)"), category: 0, purchase: 550, sale: 700, measureUnit: "kg", unitsPerMeasure: 1000 },
      { name: tx("Mineral water 1.5 L (sample)", "Eau minérale 1,5 L (exemple)"), category: 1, purchase: 300, sale: 450, packaging: [{ unit: PACK, qty: 6 }] },
      { name: tx("Sugar cubes 1 kg (sample)", "Sucre en morceaux 1 kg (exemple)"), category: 0, purchase: 800, sale: 1000, packaging: [{ unit: CARTON, qty: 20 }] },
      { name: tx("Laundry soap (sample)", "Savon de ménage (exemple)"), category: 4, purchase: 200, sale: 300, packaging: [{ unit: CARTON, qty: 40 }] },
    ],
    lowStock: 20,
    packaging: [CARTON, PACK, tx("Crate", "Casier"), tx("Bag", "Sac")],
  },
  electronics: {
    categories: [
      tx("Phones", "Téléphones"), tx("Phone accessories", "Accessoires téléphone"), tx("Computers", "Informatique"),
      tx("Audio & TV", "Audio & TV"), tx("Appliances", "Électroménager"), tx("Spare parts", "Pièces détachées"),
    ],
    services: [
      { name: tx("Repair", "Réparation"), category: tx("Workshop", "Atelier") },
      { name: tx("Diagnosis", "Diagnostic"), category: tx("Workshop", "Atelier") },
      { name: tx("Installation", "Installation"), category: tx("On site", "Sur place") },
      { name: tx("Software flashing", "Flashage"), category: tx("Workshop", "Atelier") },
    ],
    demo: [
      { name: tx("USB-C charger (sample)", "Chargeur USB-C (exemple)"), category: 1, purchase: 2500, sale: 4000 },
      { name: tx("Earphones (sample)", "Écouteurs (exemple)"), category: 1, purchase: 1500, sale: 3000 },
      { name: tx("Screen protector (sample)", "Protection d'écran (exemple)"), category: 1, purchase: 300, sale: 1000 },
    ],
    lowStock: 3,
    packaging: [BOX, CARTON],
  },
  fashion: {
    categories: [tx("Men", "Hommes"), tx("Women", "Femmes"), tx("Children", "Enfants"), tx("Shoes", "Chaussures"), tx("Bags & accessories", "Sacs & accessoires")],
    services: [
      { name: tx("Alteration", "Retouche"), category: tx("Sewing", "Couture") },
      { name: tx("Hemming", "Ourlet"), category: tx("Sewing", "Couture") },
    ],
    demo: [
      { name: tx("Cotton T-shirt (sample)", "T-shirt coton (exemple)"), category: 0, purchase: 2000, sale: 4000 },
      { name: tx("Wax dress (sample)", "Robe en pagne (exemple)"), category: 1, purchase: 6000, sale: 12000 },
      { name: tx("Sandals (sample)", "Sandales (exemple)"), category: 3, purchase: 3000, sale: 6000 },
    ],
    lowStock: 2,
    packaging: [tx("Bale", "Balle"), PACK],
  },
  food: {
    categories: [tx("Meat", "Viandes"), tx("Poultry", "Volaille"), tx("Fish", "Poissons"), tx("Cold cuts", "Charcuterie"), tx("Fruit & vegetables", "Fruits & légumes")],
    services: [],
    demo: [
      { name: tx("Beef (sample)", "Viande de boeuf (exemple)"), category: 0, purchase: 2800, sale: 3500, measureUnit: "kg", unitsPerMeasure: 1000 },
      { name: tx("Whole chicken (sample)", "Poulet entier (exemple)"), category: 1, purchase: 2500, sale: 3500 },
      { name: tx("Tomatoes (sample)", "Tomates (exemple)"), category: 4, purchase: 400, sale: 600, measureUnit: "kg", unitsPerMeasure: 1000 },
    ],
    lowStock: 5,
    packaging: [CARTON, tx("Crate", "Cageot")],
  },
  workshop: {
    categories: [tx("Raw materials", "Matières premières"), tx("Finished products", "Produits finis"), tx("Consumables", "Consommables"), tx("Tools", "Outillage")],
    services: [
      { name: tx("Custom work", "Fabrication sur mesure"), category: tx("Production", "Production") },
      { name: tx("Labour", "Main d'oeuvre"), category: tx("Production", "Production") },
      { name: tx("Delivery", "Livraison"), category: tx("Logistics", "Logistique") },
    ],
    demo: [
      { name: tx("Plank 2 m (sample)", "Planche 2 m (exemple)"), category: 0, purchase: 1500, sale: 2000 },
      { name: tx("Screws (sample)", "Vis (exemple)"), category: 2, purchase: 1000, sale: 1500, packaging: [{ unit: BOX, qty: 100 }] },
      { name: tx("Stool (sample)", "Tabouret (exemple)"), category: 1, purchase: 5000, sale: 9000 },
    ],
    lowStock: 5,
    packaging: [CARTON, BOX, tx("Roll", "Rouleau")],
  },
};

const isType = (t: string | null | undefined): t is BusinessTypeId => !!t && t in KITS;
const kitFor = (type: string | null | undefined): TypeKit => KITS[isType(type) ? type : "general"];

/** Editable starter content shown in the wizard's last step. */
export interface StarterKitDraft {
  categories: string[];
  services: { name: string; category: string | null }[];
  defaultSupplier: boolean;
  demoProducts: boolean;
}

export function starterKitDraft(type: string | null | undefined, lang: Lang): StarterKitDraft {
  const kit = kitFor(type);
  return {
    categories: kit.categories.map((c) => c[lang]),
    services: kit.services.map((s) => ({ name: s.name[lang], category: s.category[lang] })),
    defaultSupplier: true,
    demoProducts: true,
  };
}

/** Names of the demo products a type would create (for the wizard preview). */
export function demoProductNames(type: string | null | undefined, lang: Lang): string[] {
  return kitFor(type).demo.map((d) => d.name[lang]);
}

export function defaultSupplierName(lang: Lang): string {
  return lang === "fr" ? "Fournisseur divers" : "Various supplier";
}

export function mainLocationName(lang: Lang): string {
  return lang === "fr" ? "Boutique principale" : "Main shop";
}

export function defaultReceiptFooter(lang: Lang): string {
  return lang === "fr"
    ? "Merci de votre visite ! Les marchandises vendues ne sont ni reprises ni échangées."
    : "Thank you for your visit! Goods sold are neither returned nor exchanged.";
}

export function defaultLowStock(type: string | null | undefined): number {
  return kitFor(type).lowStock;
}

/** Packaging names offered as one-tap chips in the product form. */
export function packagingSuggestions(type: string | null | undefined, lang: Lang): string[] {
  return kitFor(type).packaging.map((p) => p[lang]);
}

/** Size / colour sets offered as one-tap chips when adding variants. */
export function variantSuggestions(lang: Lang): { label: string; values: string[] }[] {
  return lang === "fr"
    ? [
        { label: "Tailles", values: ["S", "M", "L", "XL", "XXL"] },
        { label: "Pointures", values: ["38", "39", "40", "41", "42", "43", "44"] },
        { label: "Couleurs", values: ["Noir", "Blanc", "Bleu", "Rouge", "Vert"] },
      ]
    : [
        { label: "Sizes", values: ["S", "M", "L", "XL", "XXL"] },
        { label: "Shoe sizes", values: ["38", "39", "40", "41", "42", "43", "44"] },
        { label: "Colours", values: ["Black", "White", "Blue", "Red", "Green"] },
      ];
}

/** Demo prices are written in XAF; other currencies get a rough conversion so a
 * sample product never shows an absurd price (they are only examples). */
const XAF_PER: Record<string, number> = { XAF: 1, XOF: 1, EUR: 656, USD: 600, GBP: 760, CHF: 700, CAD: 440, NGN: 0.4, GHS: 40, CDF: 0.22, MAD: 60 };
function convertDemoPrice(xaf: number, currency: string): number {
  const rate = XAF_PER[currency.toUpperCase()];
  if (!rate || rate === 1) return xaf;
  const v = xaf / rate;
  return v >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
}

/** The request body for the server, from the (edited) draft. `categories` in the
 * draft may have been changed by the owner: a demo product whose category was
 * removed is still created, under its original category name. */
export function buildStarterKitRequest(
  type: string | null | undefined, lang: Lang, draft: StarterKitDraft, currency: string,
): StarterKitRequest {
  const kit = kitFor(type);
  return {
    categories: draft.categories.map((c) => c.trim()).filter(Boolean),
    services: draft.services.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), category: s.category?.trim() || null })),
    defaultSupplierName: draft.defaultSupplier ? defaultSupplierName(lang) : null,
    demoProducts: draft.demoProducts
      ? kit.demo.map((d) => ({
          name: d.name[lang],
          category: kit.categories[d.category]?.[lang] ?? null,
          purchasePrice: convertDemoPrice(d.purchase, currency),
          salePrice: convertDemoPrice(d.sale, currency),
          measureUnit: d.measureUnit ?? null,
          unitsPerMeasure: d.unitsPerMeasure ?? 1,
          packagingLevels: (d.packaging ?? []).map((p) => ({ unitName: p.unit[lang], quantityInBaseUnits: p.qty, salePriceOverride: null })),
        }))
      : [],
  };
}
