import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { IconButton } from "@/components/IconButton";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useT } from "@/lib/i18n";
import { logout } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { useHeartbeat } from "@/lib/useHeartbeat";
import { useThemeStore } from "@/lib/theme";

const NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: "/superadmin", label: "Overview", icon: "📊", end: true },
  { to: "/superadmin/companies", label: "Companies", icon: "🏢" },
  { to: "/superadmin/devices", label: "Devices & sessions", icon: "💻" },
  { to: "/superadmin/users", label: "Users", icon: "👥" },
  { to: "/superadmin/audit", label: "Audit log", icon: "📜" },
  { to: "/superadmin/admins", label: "Administrators", icon: "🛡️" },
];

export function SuperAdminShell() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const t = useT();
  const userName = useAuthStore((s) => s.user?.name ?? "Super Admin");
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);
  useHeartbeat();

  function onLogout() {
    logout();
    navigate("/onboarding", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ScreenBackground />
      <aside className="sidebar flex h-full w-64 shrink-0 flex-col">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-lg"
            style={{ backgroundColor: "rgb(99 102 241)", boxShadow: "0 4px 14px rgb(99 102 241 / 0.4)" }}
          >
            S
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-text-primary">StockFlow</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t("Super Admin")}</div>
          </div>
        </div>
        <div className="mx-4 border-t border-border" />
        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "font-semibold text-white" : "font-medium text-text-secondary hover:bg-primary/10 hover:text-primary"
                }`
              }
              style={({ isActive }) =>
                isActive ? { backgroundColor: "rgb(99 102 241)", boxShadow: "0 2px 14px rgb(99 102 241 / 0.4)" } : undefined
              }
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-end gap-2 border-b border-border/60 bg-surface/70 px-4 backdrop-blur-xl">
          <span className="mr-auto text-sm font-medium text-text-secondary">{userName}</span>
          <button
            onClick={() => setLanguage(language === "en" ? "fr" : "en")}
            title={language === "en" ? "Passer en français" : "Switch to English"}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-secondary transition hover:bg-surface"
          >
            {language === "en" ? "FR" : "EN"}
          </button>
          <button
            onClick={toggleTheme}
            title={t("Toggle theme")}
            className="grid h-9 w-9 place-items-center rounded-full text-sm transition hover:bg-surface"
          >
            {mode === "dark" ? "☀️" : "🌙"}
          </button>
          <div className="mx-1 h-6 w-px bg-border" />
          <IconButton icon="⏻" label={t("Log out")} tone="danger" onClick={onLogout} className="rounded-full" />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div key={routeLocation.pathname} className="page-enter mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
