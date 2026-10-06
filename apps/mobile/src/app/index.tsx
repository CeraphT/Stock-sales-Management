import { Redirect } from 'expo-router';

import { UserRole } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';

/** Entry route. No session → login. A shop left open reopens straight away, even
 * offline (the session is kept on the device). Signed in with no shop open →
 * "My shops". A SuperAdmin keeps the dashboard + company picker flow. */
export default function EntryScreen() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const companyId = useAuthStore((s) => s.companyId);
  const role = useAuthStore((s) => s.user?.role);

  if (!hasHydrated) return null;
  if (!token) return <Redirect href={'/login' as never} />;
  if (companyId || role === UserRole.SuperAdmin) return <Redirect href="/dashboard" />;
  return <Redirect href={'/shops' as never} />;
}
