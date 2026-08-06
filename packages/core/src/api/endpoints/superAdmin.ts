import { api } from "../client";
import type {
  CreateSuperAdminRequest,
  ImpersonateResponse,
  SuperAdminAccount,
  SuperAdminCompanyDetail,
  SuperAdminCompanySummary,
} from "../types/superAdmin";

/** Cross-tenant super-admin API (the `/api/superadmin/*` group — every call
 * requires a SuperAdmin token). Used by the web super-admin console. */
export const superAdminApi = {
  listCompanies: () => api.get<SuperAdminCompanySummary[]>("/api/superadmin/companies"),

  getCompany: (id: string) => api.get<SuperAdminCompanyDetail>(`/api/superadmin/companies/${id}`),

  /** Mint a company-scoped session so the SuperAdmin can operate inside a tenant. */
  impersonate: (id: string) =>
    api.post<ImpersonateResponse>(`/api/superadmin/companies/${id}/impersonate`, {}),

  listAdmins: () => api.get<SuperAdminAccount[]>("/api/superadmin/admins"),

  createAdmin: (body: CreateSuperAdminRequest) =>
    api.post<SuperAdminAccount>("/api/superadmin/admins", body),

  setAdminActive: (id: string, active: boolean) =>
    api.put<SuperAdminAccount>(`/api/superadmin/admins/${id}/active`, { active }),
};
