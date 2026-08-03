import { createHashRouter, Navigate } from "react-router-dom";

import { ALL_NAV_ITEMS } from "@/lib/nav";
import { useAuthStore } from "@/lib/stores";
import { Dashboard } from "@/screens/Dashboard";
import { Placeholder } from "@/screens/Placeholder";
import { Shell } from "@/screens/Shell";
import { CreateCompany } from "@/screens/auth/CreateCompany";
import { JoinCompany } from "@/screens/auth/JoinCompany";
import { Login } from "@/screens/auth/Login";
import { Onboarding } from "@/screens/auth/Onboarding";

function RootRedirect() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  if (!hasHydrated) return null;
  return <Navigate to={token ? "/dashboard" : "/onboarding"} replace />;
}

/** Layout route for the authenticated app — renders the Shell (which hosts the
 * child <Outlet/>) only when a session exists, else bounces to onboarding. */
function AuthGuard() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/onboarding" replace />;
  return <Shell />;
}

export const router = createHashRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/login", element: <Login /> },
  { path: "/create-company", element: <CreateCompany /> },
  { path: "/join-company", element: <JoinCompany /> },
  {
    element: <AuthGuard />,
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      // Every other nav destination is a placeholder until its screen is built.
      ...ALL_NAV_ITEMS.filter((i) => i.path !== "/dashboard").map((i) => ({
        path: i.path,
        element: <Placeholder title={i.label} />,
      })),
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
