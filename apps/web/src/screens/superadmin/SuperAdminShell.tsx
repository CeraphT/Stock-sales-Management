import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { IconButton } from "@/components/IconButton";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useT } from "@/lib/i18n";
import { logout } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { useThemeStore } from "@/lib/theme";

const NAV = [
  { to: "/superadmin", label: "Companies", icon: "🏢", end: true },
  { to: "/superadmin/admins", label: "Administrators", icon: "🛡️" },
];

export function SuperAdminShell() {
  const navigate = useNavigate();
  const t = useT();
  const userName = useAuthStore((s) => s.user?.name ?? "Super Admin");
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  function onLogout() {
    logout();
    navigate("/onboarding", { replace: true });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ScreenBackground />
      <header className="flex h-16 items-center justify-between border-b border-border/60 bg-surface/70 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl text-base font-extrabold text-white"
              style={{ backgroundColor: "rgb(99 102 241)", boxShadow: "0 4px 14px rgb(99 102 241 / 0.4)" }}
            >
              S
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-text-primary">StockFlow</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t("Super Admin")}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${
                    isActive
                      ? "font-semibold text-white"
                      : "font-medium text-text-secondary hover:bg-primary/10 hover:text-primary"
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { backgroundColor: "rgb(99 102 241)", boxShadow: "0 2px 14px rgb(99 102 241 / 0.4)" } : undefined
                }
              >
                <span className="text-base">{item.icon}</span>
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm font-medium text-text-secondary sm:inline">{userName}</span>
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
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
