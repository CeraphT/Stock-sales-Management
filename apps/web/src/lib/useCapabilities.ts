import type { InventoryCapabilities } from "@stockflow/core/api/types/auth";

import { useCompany } from "@/lib/useCompany";

/** Defaults when a company predates the capability system (expiry on, rest off)
 * — matches the server-side model defaults. */
export const DEFAULT_CAPABILITIES: InventoryCapabilities = {
  expiryTracking: true,
  sellByMeasure: false,
  serialTracking: false,
  variants: false,
  assembly: false,
};

/** The current company's inventory capabilities. Screens gate their advanced UI
 * on these (e.g. `if (caps.serialTracking) …`) so a simple shop never sees a
 * feature it didn't turn on. */
export function useCapabilities(): InventoryCapabilities {
  return useCompany().data?.capabilities ?? DEFAULT_CAPABILITIES;
}
