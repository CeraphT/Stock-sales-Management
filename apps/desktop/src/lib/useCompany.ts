import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/stores";

/** The company (name, currency, tax, loyalty settings). Fetched from the API
 * (reliable + cached) rather than the local sync mirror, so the name/currency
 * are available immediately after login even before the first sync populates
 * the local DB. */
export function useCompany() {
  const companyId = useAuthStore((s) => s.companyId);
  return useQuery({
    queryKey: ["company", companyId],
    queryFn: () => companiesApi.get(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/** The company's currency string (free text, e.g. "XAF"). */
export function useCurrency(): string {
  return useCompany().data?.currency ?? "XAF";
}
