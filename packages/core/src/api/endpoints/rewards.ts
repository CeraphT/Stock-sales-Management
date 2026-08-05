import { api } from "../client";
import type { GiftCardResponse } from "../types/customers";

/** Purchase-milestone reward program status for one customer. */
export interface RewardStatusResponse {
  enabled: boolean;
  purchaseCount: number;
  threshold: number;
  rewardValue: number;
  rewardsEarned: number;
  rewardsGranted: number;
  rewardsDue: number;
  purchasesUntilNext: number;
}

export const rewardsApi = {
  status: (companyId: string, customerId: string) =>
    api.get<RewardStatusResponse>(`/api/companies/${companyId}/customers/${customerId}/reward/status`),
  /** Issue one reward gift card the customer is owed; returns the new card. */
  issue: (companyId: string, customerId: string) =>
    api.post<GiftCardResponse>(`/api/companies/${companyId}/customers/${customerId}/reward/issue`, {}),
};
