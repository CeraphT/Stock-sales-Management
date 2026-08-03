import { api } from "../client";
import type {
  AdminResetPasswordRequest,
  AuthResponse,
  ChangePasswordRequest,
  CreateStaffUserRequest,
  LoginRequest,
  SetUserActiveRequest,
  SetUserPermissionsRequest,
  UserResponse,
} from "../types/auth";

export const authApi = {
  login: (body: LoginRequest) => api.post<AuthResponse>("/api/auth/login", body, { skipAuth: true }),
  createStaffUser: (companyId: string, body: CreateStaffUserRequest) =>
    api.post<UserResponse>(`/api/companies/${companyId}/users`, body),
  listStaffUsers: (companyId: string) => api.get<UserResponse[]>(`/api/companies/${companyId}/users`),
  setStaffUserActive: (companyId: string, userId: string, body: SetUserActiveRequest) =>
    api.put<UserResponse>(`/api/companies/${companyId}/users/${userId}/active`, body),
  setStaffUserPermissions: (companyId: string, userId: string, body: SetUserPermissionsRequest) =>
    api.put<UserResponse>(`/api/companies/${companyId}/users/${userId}/permissions`, body),
  resetStaffUserPassword: (companyId: string, userId: string, body: AdminResetPasswordRequest) =>
    api.put<void>(`/api/companies/${companyId}/users/${userId}/password`, body),
  changePassword: (body: ChangePasswordRequest) => api.post<void>("/api/auth/change-password", body),
};
