import type { InventoryCapabilities } from "@stockflow/core/api/types/auth";

/** Per-capability label + help text, for the settings toggles. */
export const CAPABILITY_META: { key: keyof InventoryCapabilities; label: string; desc: string }[] = [
  { key: "expiryTracking", label: "Expiry & batches", desc: "Track batch expiry dates (FEFO) — pharmacies, food, cosmetics." },
  { key: "sellByMeasure", label: "Weight / measure selling", desc: "Sell by kg, m or L — butchers, delis, fabric, produce." },
  { key: "serialTracking", label: "Serial / IMEI numbers", desc: "Per-unit serials + warranty — electronics, high-value goods." },
  { key: "variants", label: "Product variants", desc: "Size / colour variants — fashion, footwear." },
  { key: "assembly", label: "Assembly / kits", desc: "Build products from components — workshops, manufacturers." },
];

/** Measure units for sell-by-weight products, each with how many integer base
 * units make one display unit (base=gram → kg=1000; base=ml → L=1000; base=cm →
 * m=100). Quantities/prices are stored per base unit; the UI shows the unit. */
export const MEASURE_UNITS: { unit: string; unitsPerMeasure: number }[] = [
  { unit: "kg", unitsPerMeasure: 1000 },
  { unit: "g", unitsPerMeasure: 1 },
  { unit: "L", unitsPerMeasure: 1000 },
  { unit: "ml", unitsPerMeasure: 1 },
  { unit: "m", unitsPerMeasure: 100 },
  { unit: "cm", unitsPerMeasure: 1 },
];

export const unitsPerMeasureFor = (unit: string): number =>
  MEASURE_UNITS.find((m) => m.unit === unit)?.unitsPerMeasure ?? 1;

export interface BusinessPreset {
  id: string;
  label: string;
  icon: string;
  caps: InventoryCapabilities;
}

const caps = (over: Partial<InventoryCapabilities>): InventoryCapabilities => ({
  expiryTracking: false,
  sellByMeasure: false,
  serialTracking: false,
  variants: false,
  assembly: false,
  ...over,
});

/** Business-type presets shown at setup — each pre-selects the capabilities that
 * type of business typically needs (still fully editable afterwards in Settings). */
export const BUSINESS_PRESETS: BusinessPreset[] = [
  { id: "general", label: "General retail / shop", icon: "🏪", caps: caps({}) },
  { id: "pharmacy", label: "Pharmacy / health", icon: "💊", caps: caps({ expiryTracking: true }) },
  { id: "grocery", label: "Grocery / mini-market", icon: "🛒", caps: caps({ expiryTracking: true, sellByMeasure: true }) },
  { id: "electronics", label: "Electronics", icon: "📱", caps: caps({ serialTracking: true }) },
  { id: "fashion", label: "Clothing / fashion", icon: "👕", caps: caps({ variants: true }) },
  { id: "food", label: "Butcher / deli / fabric", icon: "⚖️", caps: caps({ sellByMeasure: true }) },
  { id: "workshop", label: "Workshop / manufacturer", icon: "🛠️", caps: caps({ assembly: true }) },
];
