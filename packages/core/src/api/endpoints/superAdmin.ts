import { api } from "../client";
import type {
  AuditLogRow,
  CreateSuperAdminRequest,
  ImpersonateResponse,
  SuperAdminAccount,
  SuperAdminCompanyDetail,
  SuperAdminCompanySummary,
  SuperAdminDeviceRow,
  SuperAdminOverview,
  SuperAdminUserRow,
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

  // ── Fleet monitoring ──────────────────────────────────────────────────
  overview: () => api.get<SuperAdminOverview>("/api/superadmin/overview"),

  listDevices: (companyId?: string) =>
    api.get<SuperAdminDeviceRow[]>("/api/superadmin/devices", companyId ? { companyId } : undefined),

  blockDevice: (id: string) => api.post<unknown>(`/api/superadmin/devices/${id}/block`, {}),
  unblockDevice: (id: string) => api.post<unknown>(`/api/superadmin/devices/${id}/unblock`, {}),
  wipeDevice: (id: string) => api.post<unknown>(`/api/superadmin/devices/${id}/wipe`, {}),

  listUsers: (companyId?: string) =>
    api.get<SuperAdminUserRow[]>("/api/superadmin/users", companyId ? { companyId } : undefined),

  setUserActive: (id: string, active: boolean) =>
    api.post<unknown>(`/api/superadmin/users/${id}/active`, { active }),

  listAudit: (take = 200) => api.get<AuditLogRow[]>("/api/superadmin/audit", { take: String(take) }),
};
