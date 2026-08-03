import type { PaymentMethod, ShiftStatus } from "../enums";

export interface OpenShiftRequest {
  openingCashAmount: number;
}

export interface CloseShiftRequest {
  closingCashAmount: number;
  closingNotes: string | null;
}

export interface ShiftSummaryResponse {
  id: string;
  locationId: string;
  locationName: string;
  openedByName: string;
  closedByName: string | null;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingCashAmount: number;
  closingCashAmount: number | null;
  expectedCashAmount: number | null;
  discrepancy: number | null;
}

export interface ShiftHistoryPageResponse {
  items: ShiftSummaryResponse[];
  hasMore: boolean;
}

export interface PaymentMethodTotal {
  method: PaymentMethod;
  total: number;
}

export interface ShiftDetailResponse extends ShiftSummaryResponse {
  closingNotes: string | null;
  salesCount: number;
  totalSales: number;
  paymentBreakdown: PaymentMethodTotal[];
}
