import { api } from "../client";
import type { GiftCardResponse, IssueGiftCardRequest, SetGiftCardActiveRequest } from "../types/customers";

export const giftCardsApi = {
  list: (companyId: string, search?: string) =>
    api.get<GiftCardResponse[]>(`/api/companies/${companyId}/giftcards`, { search }),

  issue: (companyId: string, body: IssueGiftCardRequest) =>
    api.post<GiftCardResponse>(`/api/companies/${companyId}/giftcards`, body),

  lookup: (companyId: string, code: string) =>
    api.get<GiftCardResponse>(`/api/companies/${companyId}/giftcards/lookup/${encodeURIComponent(code)}`),

  setActive: (companyId: string, giftCardId: string, body: SetGiftCardActiveRequest) =>
    api.put<GiftCardResponse>(`/api/companies/${companyId}/giftcards/${giftCardId}/active`, body),
};
