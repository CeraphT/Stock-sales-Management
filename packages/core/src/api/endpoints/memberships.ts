import { api } from "../client";
import type { AuthResponse, RegisterRequest, SelectCompanyRequest, UserResponse } from "../types/auth";
import type { ApproveJoinRequest, JoinByCodeResponse, JoinRequestResponse, MyCompanyResponse } from "../types/membership";

/** Accounts with several businesses: sign-up, "My shops", opening a shop, and
 * join-by-code requests that a shop admin accepts or rejects. */
export const membershipsApi = {
  register: (body: RegisterRequest) => api.post<AuthResponse>("/api/auth/register", body, { skipAuth: true }),
  /** Opens one of the account's shops: returns a shop-scoped session. */
  selectCompany: (body: SelectCompanyRequest) => api.post<AuthResponse>("/api/auth/select-company", body),
  myCompanies: () => api.get<MyCompanyResponse[]>("/api/me/companies"),
  join: (uniqueCode: string) => api.post<JoinByCodeResponse>("/api/me/join", { uniqueCode }),
  joinRequests: (companyId: string) => api.get<JoinRequestResponse[]>(`/api/companies/${companyId}/join-requests`),
  approve: (companyId: string, membershipId: string, body: ApproveJoinRequest) =>
    api.post<UserResponse>(`/api/companies/${companyId}/join-requests/${membershipId}/approve`, body),
  reject: (companyId: string, membershipId: string) =>
    api.post<void>(`/api/companies/${companyId}/join-requests/${membershipId}/reject`, {}),
};
