import { api } from "../client";
import type {
  CustomerRequest,
  CustomerResponse,
  LoyaltyAccountResponse,
  RedeemLoyaltyPointsRequest,
} from "../types/customers";

export const customersApi = {
  list: (companyId: string, search?: string) =>
    api.get<CustomerResponse[]>(`/api/companies/${companyId}/customers`, { search }),

  create: (companyId: string, body: CustomerRequest) =>
    api.post<CustomerResponse>(`/api/companies/${companyId}/customers`, body),

  redeemLoyalty: (companyId: string, customerId: string, body: RedeemLoyaltyPointsRequest) =>
    api.post<LoyaltyAccountResponse>(
      `/api/companies/${companyId}/customers/${customerId}/loyalty/redeem`,
      body,
    ),
};
