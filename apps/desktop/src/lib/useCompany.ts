import { localCatalogQueryService } from "@stockflow/core/local/catalogQueryService";
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/stores";

/** The company row from the local DB (currency, tax, loyalty settings). */
export function useCompany() {
  const companyId = useAuthStore((s) => s.companyId);
  return useQuery({
    queryKey: ["company", companyId],
    queryFn: () => localCatalogQueryService.getCompany(companyId!),
    enabled: !!companyId,
  });
}

/** The company's currency string (free text, e.g. "XAF") — defaults sensibly
 * before the first sync lands. */
export function useCurrency(): string {
  return useCompany().data?.currency ?? "XAF";
}
