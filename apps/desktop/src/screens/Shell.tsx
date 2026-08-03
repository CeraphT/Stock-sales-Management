import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { ALL_NAV_ITEMS, NAV } from "@/lib/nav";
import { roleLabel } from "@/lib/labels";
import { logout } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { useThemeStore } from "@/lib/theme";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const title = ALL_NAV_ITEMS.find((i) => i.path === location.pathname)?.label ?? "PharmaStock";

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function doSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await runSync();
      setSyncMsg(`Synced · ${r.rowsPulled} rows${r.salesFailed ? ` · ${r.salesFailed} failed` : ""}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed");
    } finally {
      setSyncing(false);
      window.setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  // Initial sync when entering the authed app (login / create / reload with a
  // live session) so screens have data. Runs once per Shell mount.
  const didInitialSync = useRef(false);
  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    void doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLogout() {
    logout();
    navigate("/onboarding", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex w-64 flex-col text-white"
        style={{ background: "linear-gradient(160deg, var(--color-primary), #312e81)" }}
      >
        <div className="px-5 py-5">
          <div className="text-lg font-extrabold tracking-tight">PharmaStock</div>
          <div className="mt-0.5 text-xs text-white/70">
            {user?.name}
            {user ? ` · ${roleLabel(user.role)}` : ""}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-3">
              {group.title ? (
                <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                  {group.title}
                </div>
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                      isActive ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"
                    }`
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
          <h1 className="truncate text-lg font-bold text-text-primary">{title}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLanguage(language === "en" ? "fr" : "en")}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-background"
            >
              {language.toUpperCase()}
            </button>
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              className="rounded-lg px-2.5 py-1.5 text-sm hover:bg-background"
            >
              {mode === "dark" ? "☀️" : "🌙"}
            </button>
            {syncMsg ? <span className="mr-1 text-xs text-text-secondary">{syncMsg}</span> : null}
            <button
              onClick={doSync}
              disabled={syncing}
              title="Sync with the server"
              className="rounded-lg px-2.5 py-1.5 text-sm hover:bg-background disabled:opacity-40"
            >
              {syncing ? "⏳" : "🔄"}
            </button>
            <button
              onClick={onLogout}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error hover:bg-background"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
