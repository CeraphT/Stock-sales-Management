import type { MembershipStatus, UserRole } from "../enums";

/** One business on the "My shops" screen. uniqueCode and pendingRequests are
 * only filled for an admin of that business. */
export interface MyCompanyResponse {
  companyId: string;
  name: string;
  logoUrl: string | null;
  currency: string;
  address: string | null;
  role: UserRole;
  status: MembershipStatus;
  companyActive: boolean;
  locationCount: number;
  uniqueCode: string | null;
  pendingRequests: number;
}

export interface JoinByCodeResponse {
  companyId: string;
  companyName: string;
  status: MembershipStatus;
}

export interface JoinRequestResponse {
  membershipId: string;
  userId: string;
  name: string;
  phone: string;
  createdAt: string;
}

export interface ApproveJoinRequest {
  role: UserRole;
  restrictCatalog?: boolean;
  restrictPurchasing?: boolean;
  restrictCustomers?: boolean;
  restrictReportsAndFullSales?: boolean;
  restrictCashRegister?: boolean;
  restrictGiftCards?: boolean;
}
