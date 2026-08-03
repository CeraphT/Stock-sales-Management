import { api } from "../client";
import type { CategoryRequest, CategoryResponse } from "../types/catalog";

export const categoriesApi = {
  list: (companyId: string, search?: string) =>
    api.get<CategoryResponse[]>(`/api/companies/${companyId}/categories`, { search }),

  create: (companyId: string, body: CategoryRequest) =>
    api.post<CategoryResponse>(`/api/companies/${companyId}/categories`, body),

  update: (companyId: string, categoryId: string, body: CategoryRequest) =>
    api.put<CategoryResponse>(`/api/companies/${companyId}/categories/${categoryId}`, body),

  delete: (companyId: string, categoryId: string) =>
    api.delete<void>(`/api/companies/${companyId}/categories/${categoryId}`),
};
