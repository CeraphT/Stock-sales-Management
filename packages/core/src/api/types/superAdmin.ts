import type { UserRole } from "../enums";

/** Cross-tenant company row with cheap aggregate stats (see the API's
 * SuperAdminCompanySummary record). SuperAdmin-only. */
export interface SuperAdminCompanySummary {
  id: string;
  name: string;
  uniqueCode: string;
  createdAt: string;
  userCount: number;
  productCount: number;
  salesCount: number;
  totalRevenue: number;
}

export interface SuperAdminCompanyUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
}

export interface SuperAdminCompanyLocation {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface SuperAdminCompanyDetail extends SuperAdminCompanySummary {
  users: SuperAdminCompanyUser[];
  locations: SuperAdminCompanyLocation[];
}

/** A SuperAdmin account (the people who can use the web super-admin console). */
export interface SuperAdminAccount {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface CreateSuperAdminRequest {
  name: string;
  phone: string;
  password: string;
}

/** The company-scoped session returned when a SuperAdmin enters ("impersonates")
 * a tenant. `token` carries that company's tenant claim; there is deliberately
 * no refresh token (impersonation is time-boxed). */
export interface ImpersonateResponse {
  token: string;
  expiresAt: string;
  companyId: string;
  companyName: string;
  locationId: string | null;
  locationName: string | null;
}
