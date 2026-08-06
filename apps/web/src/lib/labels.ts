import { UserRole } from "@stockflow/core/api/enums";

export function roleLabel(role?: UserRole | number): string {
  switch (role) {
    case UserRole.CompanyAdmin:
      return "Admin";
    case UserRole.SuperAdmin:
      return "Super admin";
    default:
      return "Cashier";
  }
}
