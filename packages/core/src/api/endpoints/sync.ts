import { api } from "../client";
import type { SyncPullResponse, SyncPushRequest, SyncPushResponse } from "../types/sync";

export const syncApi = {
  pull: (companyId: string, locationId: string, since: string | null) =>
    api.get<SyncPullResponse>(`/api/companies/${companyId}/sync/pull`, {
      locationId,
      since: since ?? undefined,
    }),
  push: (companyId: string, body: SyncPushRequest) =>
    api.post<SyncPushResponse>(`/api/companies/${companyId}/sync/push`, body),
};
