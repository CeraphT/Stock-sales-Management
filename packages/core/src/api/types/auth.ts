import type { DevicePlatform, UserRole } from "../enums";

export interface LoginRequest {
  phone: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
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
}

export interface CreateCompanyRequest {
  name: string;
  description: string | null;
  currency: string;
  adminName: string;
  adminPhone: string;
  adminPassword: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
}

export interface JoinCompanyRequest {
  uniqueCode: string;
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
