import { api } from "../client";
import type { CreateLocationRequest, LocationResponse } from "../types/auth";

export const locationsApi = {
  list: (companyId: string) => api.get<LocationResponse[]>(`/api/companies/${companyId}/locations`),

  create: (companyId: string, body: CreateLocationRequest) =>
    api.post<LocationResponse>(`/api/companies/${companyId}/locations`, body),
};
