import { useAuthStore } from '@/lib/auth/store';

/** Routes that still make sense with NO company in the session (a SuperAdmin
 * who hasn't entered a business yet). Everything else is company-scoped: the
 * navigation greys it out, and (app)/_layout covers it with NoCompanyNotice if
 * it's reached anyway (deep link, back stack). */
const NO_COMPANY_ROUTES = ['/dashboard', '/more', '/company-picker', '/change-password', '/printer-settings', '/support', '/support-ticket'];

export function isCompanyRoute(route: string | undefined): boolean {
  if (!route) return false;
  return !NO_COMPANY_ROUTES.some((r) => route === r || route.startsWith(r + '/'));
}

/** True while the session has no company — company features are locked. */
export function useCompanyLocked(): boolean {
  const token = useAuthStore((s) => s.token);
  const companyId = useAuthStore((s) => s.companyId);
  return !!token && !companyId;
}
