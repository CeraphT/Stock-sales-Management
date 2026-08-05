export interface CustomerRequest {
  name: string;
  phone: string | null;
  isBusiness?: boolean;
  taxId?: string | null;
}

export interface CustomerResponse {
  id: string;
  name: string;
  phone: string | null;
  creditBalance: number;
  loyaltyPointsBalance: number;
  loyaltyStoreCreditBalance: number;
  rewardsGranted: number;
  isBusiness: boolean;
  taxId: string | null;
}

import type { SaleStatus } from "../enums";

export interface CustomerCreditEntry {
  saleId: string;
  timestamp: string;
  total: number;
  status: SaleStatus;
  /** Portion put on account (adds to what they owe). */
  creditAmount: number;
  /** Portion paid from store credit (reduces store credit). */
  storeCreditAmount: number;
  /** "2× Amoxicillin, 1× Aspirin" — what the order contained. */
  items: string;
}

export interface CustomerCreditHistoryResponse {
  creditBalance: number;
  storeCreditBalance: number;
  entries: CustomerCreditEntry[];
}

export interface IssueGiftCardRequest {
  initialValue: number;
}

export interface GiftCardResponse {
  id: string;
  code: string;
  initialValue: number;
  remainingValue: number;
  active: boolean;
  createdAt: string;
}

export interface SetGiftCardActiveRequest {
  active: boolean;
}

export interface RedeemLoyaltyPointsRequest {
  points: number;
}

export interface LoyaltyAccountResponse {
  pointsBalance: number;
  storeCreditBalance: number;
}
