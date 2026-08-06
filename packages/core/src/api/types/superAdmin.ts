import type { DevicePlatform, UserRole } from "../enums";

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
  email: string | null;
  active: boolean;
}

export interface CreateSuperAdminRequest {
  name: string;
  phone: string;
  password: string;
  email?: string;
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

// ── Fleet monitoring ────────────────────────────────────────────────────────
export interface SuperAdminOverview {
  totalCompanies: number;
  newCompanies7d: number;
  totalUsers: number;
  totalDevices: number;
  liveDevices: number;
  activeUsers24h: number;
  activeUsers7d: number;
  mobileActive7d: number;
  desktopActive7d: number;
  webActive7d: number;
}

export interface SuperAdminDeviceRow {
  id: string;
  companyId: string | null;
  companyName: string | null;
  userId: string;
  userName: string;
  platform: DevicePlatform;
  deviceName: string;
  appVersion: string | null;
  lastActiveAt: string;
  createdAt: string;
  lastIp: string | null;
  city: string | null;
  country: string | null;
  isRevoked: boolean;
  remoteWipeRequested: boolean;
}

export interface SuperAdminUserRow {
  id: string;
  companyId: string | null;
  companyName: string | null;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  lastActiveAt: string | null;
}

export interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  companyId: string | null;
  ip: string | null;
  detail: string | null;
  createdAt: string;
}
