import { api } from "../client";
import type {
  CompanyResponse,
  CreateCompanyRequest,
  CreateCompanyResponse,
  JoinCompanyRequest,
  UpdateCompanyRequest,
} from "../types/auth";

export interface ConvertCurrencyResponse {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  products: number;
  batches: number;
  customers: number;
  giftCards: number;
}

export const companiesApi = {
  create: (body: CreateCompanyRequest) =>
    api.post<CreateCompanyResponse>("/api/companies", body, { skipAuth: true }),
  /** From the "My shops" screen: the signed-in account becomes the admin, and
   * body.settings (the wizard fields) is saved on the company. */
  createForAccount: (body: CreateCompanyRequest) => api.post<CreateCompanyResponse>("/api/companies", body),
  join: (body: JoinCompanyRequest) =>
    api.post<CompanyResponse>("/api/companies/join", body, { skipAuth: true }),
  get: (id: string) => api.get<CompanyResponse>(`/api/companies/${id}`),
  update: (id: string, body: UpdateCompanyRequest) =>
    api.put<CompanyResponse>(`/api/companies/${id}`, body),
  /** Admin-only: convert prices & balances to `toCurrency` at today's FX rate. */
  convertCurrency: (id: string, toCurrency: string) =>
    api.post<ConvertCurrencyResponse>(`/api/companies/${id}/currency/convert`, { toCurrency }),
};
