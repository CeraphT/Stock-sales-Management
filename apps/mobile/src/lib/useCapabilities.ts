import type { InventoryCapabilities } from '@stockflow/core/api/types/auth';
import { useQuery } from '@tanstack/react-query';

import { companiesApi } from '@/lib/api/endpoints/companies';
import { useAuthStore } from '@/lib/auth/store';

/** Defaults when a company predates the capability system (expiry on, rest off)
 * — matches the server-side model defaults. */
export const DEFAULT_CAPABILITIES: InventoryCapabilities = {
  expiryTracking: true,
  sellByMeasure: false,
  serialTracking: false,
  variants: false,
  assembly: false,
};

/** The current company's inventory capabilities, used to gate advanced product
 * management UI (measure/serial/variant/assembly). Fetched online (cached by
 * react-query) — the same source web/desktop use. The POS itself keys off each
 * product's own synced flags, so weighing/etc. still works fully offline; only
 * the management toggles' visibility depends on this. */
export function useCapabilities(): InventoryCapabilities {
  const companyId = useAuthStore((s) => s.companyId);
  const { data } = useQuery({
    queryKey: ['company-capabilities', companyId],
    queryFn: () => companiesApi.get(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
  return data?.capabilities ?? DEFAULT_CAPABILITIES;
}
