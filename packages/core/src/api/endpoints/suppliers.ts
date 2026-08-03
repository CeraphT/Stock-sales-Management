import { api } from "../client";
import type { SupplierRequest, SupplierResponse } from "../types/catalog";

export const suppliersApi = {
  list: (companyId: string, search?: string) =>
    api.get<SupplierResponse[]>(`/api/companies/${companyId}/suppliers`, { search }),

  create: (companyId: string, body: SupplierRequest) =>
    api.post<SupplierResponse>(`/api/companies/${companyId}/suppliers`, body),

  update: (companyId: string, supplierId: string, body: SupplierRequest) =>
    api.put<SupplierResponse>(`/api/companies/${companyId}/suppliers/${supplierId}`, body),

  delete: (companyId: string, supplierId: string) =>
    api.delete<void>(`/api/companies/${companyId}/suppliers/${supplierId}`),
};
