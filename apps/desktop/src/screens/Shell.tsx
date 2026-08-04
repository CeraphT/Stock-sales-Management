import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useBreadcrumb, type Crumb } from "@/lib/breadcrumb";
import { NAV } from "@/lib/nav";
import { logout } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";
import { useThemeStore } from "@/lib/theme";
import { useCompany } from "@/lib/useCompany";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationName = useAuthStore((s) => s.locationName);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const companyName = useCompany().data?.name ?? "…";
  const initial = (companyName.trim()[0] ?? "•").toUpperCase();

  // Breadcrumb trail — a detail screen's published trail (keyed to its path)
  // wins; otherwise derive "Group › Page" from the nav structure.
  const bc = useBreadcrumb();
  const crumbs: Crumb[] = useMemo(() => {
    if (bc.forPath === location.pathname && bc.trail.length) return bc.trail;
    for (const g of NAV) {
      const item = g.items.find((i) => i.path === location.pathname);
      if (item) return g.title ? [{ label: g.title }, { label: item.label }] : [{ label: item.label }];
    }
    return [{ label: companyName }];
  }, [bc.forPath, bc.trail, location.pathname, companyName]);

  // Collapsible sidebar groups — start with only the group containing the
  // current route open, so the menu stays short (no scrolling).
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(NAV.filter((g) => g.title && g.items.some((i) => i.path === location.pathname)).map((g) => g.title)),
  );
  const toggleGroup = (t: string) =>
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function doSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await runSync();
      toast(
        `Synced · ${r.rowsPulled} items updated${r.salesPushed ? ` · ${r.salesPushed} sent` : ""}${r.salesFailed ? ` · ${r.salesFailed} failed` : ""}`,
        r.salesFailed ? "error" : "success",
      );
    } catch (e) {
      toast(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  const didInitialSync = useRef(false);
  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    void doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the company name in the browser tab / OS window title.
  useEffect(() => {
    const t = companyName && companyName !== "…" ? companyName : "StockFlow";
    document.title = t;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/window")
        .then((m) => m.getCurrentWindow().setTitle(t))
        .catch(() => {});
    }
  }, [companyName]);

  function onLogout() {
    logout();
    navigate("/onboarding", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Collapsible sidebar — hidden entirely when closed so the content
          area takes the full width. */}
      <aside className={`sidebar h-full w-64 shrink-0 flex-col text-white ${sidebarOpen ? "flex" : "hidden"}`}>
        {/* Company brand — the company name is the single identity here. */}
        <div className="flex items-center gap-3 px-4 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white ring-1 ring-white/10"
            style={{ backgroundColor: "rgb(99 102 241 / 0.3)" }}
          >
            {initial}
          </div>
          <div className="truncate text-base font-bold leading-tight text-white">{companyName}</div>
        </div>
        <div className="mx-4 border-t border-white/10" />

        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((group, gi) => {
            const items = group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? "font-semibold text-white" : "font-medium text-white/50 hover:bg-white/10 hover:text-white"
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { backgroundColor: "rgb(99 102 241 / 0.28)", boxShadow: "0 2px 16px rgb(99 102 241 / 0.28)" } : undefined
                }
              >
                <span className="w-5 text-center text-base">{item.icon}</span>
                {item.label}
              </NavLink>
            ));

            // Ungrouped items (Dashboard) render directly, always visible.
            if (!group.title) return <div key={gi}>{items}</div>;

            const open = openGroups.has(group.title);
            return (
              <div key={gi} className="pt-1">
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45 transition hover:text-white/80"
                >
                  <span>{group.title}</span>
                  <span className={`text-[10px] transition-transform duration-200 ${open ? "rotate-90" : ""}`}>▶</span>
                </button>
                {open ? <div className="mt-0.5 space-y-0.5">{items}</div> : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border/60 bg-surface/70 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Hide menu" : "Show menu"}
              className="grid h-9 w-9 place-items-center rounded-lg text-lg text-text-secondary transition hover:bg-surface"
            >
              ☰
            </button>
            <nav className="flex items-center gap-1.5 truncate text-[15px]">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 ? <span className="text-text-secondary/50">›</span> : null}
                    {c.to && !last ? (
                      <button
                        onClick={() => navigate(c.to!)}
                        className="font-medium text-text-secondary transition hover:text-text-primary"
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span className={last ? "font-bold text-text-primary" : "font-medium text-text-secondary"}>{c.label}</span>
                    )}
                  </span>
                );
              })}
            </nav>
            {locationName ? (
              <span className="rounded-full border border-border/70 bg-surface/60 px-2.5 py-0.5 text-xs font-medium text-text-secondary">📍 {locationName}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === "en" ? "fr" : "en")}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-secondary transition hover:bg-surface"
            >
              {language.toUpperCase()}
            </button>
            <button
              onClick={doSync}
              disabled={syncing}
              title="Sync with the server"
              className="grid h-9 w-9 place-items-center rounded-full text-sm transition hover:bg-surface disabled:opacity-40"
            >
              {syncing ? "⏳" : "🔄"}
            </button>
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              className="grid h-9 w-9 place-items-center rounded-full text-sm transition hover:bg-surface"
            >
              {mode === "dark" ? "☀️" : "🌙"}
            </button>
            <div className="mx-1 h-6 w-px bg-border" />
            <button
              onClick={onLogout}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error/10"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
