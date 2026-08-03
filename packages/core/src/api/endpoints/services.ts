import { api } from "../client";
import type { ServiceRequest, ServiceResponse, SetServiceActiveRequest } from "../types/services";

export const servicesApi = {
  list: (companyId: string) => api.get<ServiceResponse[]>(`/api/companies/${companyId}/services`),
  create: (companyId: string, body: ServiceRequest) =>
    api.post<ServiceResponse>(`/api/companies/${companyId}/services`, body),
  update: (companyId: string, serviceId: string, body: ServiceRequest) =>
    api.put<ServiceResponse>(`/api/companies/${companyId}/services/${serviceId}`, body),
  setActive: (companyId: string, serviceId: string, body: SetServiceActiveRequest) =>
    api.put<ServiceResponse>(`/api/companies/${companyId}/services/${serviceId}/active`, body),
};
