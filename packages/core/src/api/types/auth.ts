import type { DevicePlatform, UserRole } from "../enums";

export interface LoginRequest {
  phone: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  /** New apps: sign in to the account only; the person then picks a shop
   * (select-company). Omitted = older behaviour, a shop session straight away. */
  accountOnly?: boolean;
  /** The same phone can hold a SuperAdmin account and a shop account: true skips
   * the SuperAdmin one (the "My shops" choice after login). */
  preferShopAccount?: boolean;
}

export interface RegisterRequest {
  name: string;
  phone: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
}

export interface SelectCompanyRequest {
  companyId: string;
  deviceId: string;
  deviceName?: string;
  platform?: DevicePlatform;
}

export interface RefreshRequest {
  deviceId: string;
  refreshToken: string;
}

export interface CreateStaffUserRequest {
  name: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface UserResponse {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  restrictCatalog: boolean;
  restrictPurchasing: boolean;
  restrictCustomers: boolean;
  restrictReportsAndFullSales: boolean;
  restrictCashRegister: boolean;
  restrictGiftCards: boolean;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  refreshToken: string;
  deviceId: string;
  user: UserResponse;
  companyId: string | null;
  /** SuperAdmin logins only: the same phone + password also opens a shop account,
   * so the app offers "Super-admin console" or "My shops". */
  hasShopAccount?: boolean;
}

export interface CreateCompanyRequest {
  name: string;
  description: string | null;
  currency: string;
  /** Only for the anonymous (older) flow; a signed-in account becomes the admin. */
  adminName?: string;
  adminPhone?: string;
  adminPassword?: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  /** Inventory features to enable, from the business-type preset at setup. */
  capabilities?: InventoryCapabilities;
  /** Every field of the creation wizard (the "My business" fields), saved on the company. */
  settings?: UpdateCompanyRequest;
}

export interface JoinCompanyRequest {
  uniqueCode: string;
}

/** Inventory features a company uses (chosen at setup). Clients gate their
 * advanced UI on these so simple shops aren't burdened with unused features. */
export interface InventoryCapabilities {
  expiryTracking: boolean;
  sellByMeasure: boolean;
  serialTracking: boolean;
  variants: boolean;
  assembly: boolean;
}

export interface CompanyResponse {
  id: string;
  name: string;
  uniqueCode: string;
  currency: string;
  servicesModuleEnabled: boolean;
  description: string | null;
  defaultTaxRatePercent: number;
  loyaltyEnabled: boolean;
  loyaltyEarnRateAmount: number;
  loyaltyPointValue: number;
  rewardProgramEnabled: boolean;
  rewardPurchaseCount: number;
  rewardGiftCardValue: number;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
  logoUrl: string | null;
  defaultLowStockThreshold: number;
  setupCompleted: boolean;
  taxRegime: number;
  flatTaxAmount: number;
  flatTaxPeriod: number;
  taxId: string | null;
  accountingSystem?: number;
  capabilities: InventoryCapabilities;
}

export interface LocationResponse {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface CreateCompanyResponse {
  company: CompanyResponse;
  admin: AuthResponse;
  defaultLocation: LocationResponse;
}

export interface UpdateCompanyRequest {
  name: string;
  description: string | null;
  currency: string;
  defaultTaxRatePercent: number;
  loyaltyEnabled: boolean;
  loyaltyEarnRateAmount: number;
  loyaltyPointValue: number;
  servicesModuleEnabled: boolean;
  rewardProgramEnabled: boolean;
  rewardPurchaseCount: number;
  rewardGiftCardValue: number;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
  logoUrl: string | null;
  defaultLowStockThreshold: number;
  setupCompleted: boolean;
  taxRegime: number;
  flatTaxAmount: number;
  flatTaxPeriod: number;
  taxId: string | null;
  accountingSystem?: number;
  capabilities?: InventoryCapabilities;
}

export interface CreateLocationRequest {
  name: string;
  address: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface SetUserActiveRequest {
  active: boolean;
}

export interface AdminResetPasswordRequest {
  newPassword: string;
}

export interface SetUserPermissionsRequest {
  restrictCatalog: boolean;
  restrictPurchasing: boolean;
  restrictCustomers: boolean;
  restrictReportsAndFullSales: boolean;
  restrictCashRegister: boolean;
  restrictGiftCards: boolean;
}
