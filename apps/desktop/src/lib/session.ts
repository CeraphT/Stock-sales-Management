import { locationsApi } from "@stockflow/core/api/endpoints/locations";

import { useImpersonation } from "@/lib/impersonation";
import { useAuthStore } from "@/lib/stores";

/** After login/company-create, pick the operating branch. Mirrors the mobile
 * app: default to the company's first ("Main") location. Multi-location
 * switching UI comes later. */
export async function resolveDefaultLocation(companyId: string): Promise<void> {
  const locations = await locationsApi.list(companyId);
  const first = locations[0];
  if (first) {
    useAuthStore.getState().setLocation({ locationId: first.id, locationName: first.name });
  }
}

export function logout(): void {
  useAuthStore.getState().clear();
  // Logging out while inside a company must not leave the impersonation
  // "active" for the next login (stale token + snapshot).
  useImpersonation.getState().reset();
}
