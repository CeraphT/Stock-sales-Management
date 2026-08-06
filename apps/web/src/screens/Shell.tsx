import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { UserRole } from "@stockflow/core/api/enums";
import { isolateCompany } from "@stockflow/core/db/isolation";
import { localShiftService } from "@stockflow/core/local/shiftService";

import { IconButton } from "@/components/IconButton";
import { RegisterGate } from "@/components/RegisterGate";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SetupWizard } from "@/components/SetupWizard";
import { useBreadcrumb, type Crumb } from "@/lib/breadcrumb";
import { useT } from "@/lib/i18n";
import { NAV } from "@/lib/nav";
import { logout } from "@/lib/session";
import { useAutoBackup } from "@/lib/useAutoBackup";
import { useIdleLogout } from "@/lib/useIdleLogout";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";
import { useThemeStore } from "@/lib/theme";
import { useCompany } from "@/lib/useCompany";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationName = useAuthStore((s) => s.locationName);
  const role = useAuthStore((s) => s.user?.role);
  const companyId = useAuthStore((s) => s.companyId);
  const shiftLocationId = useAuthStore((s) => s.locationId);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const t = useT();

  const company = useCompany().data;
  const companyName = company?.name ?? "…";
  const initial = (companyName.trim()[0] ?? "•").toUpperCase();

  // First-login setup wizard: shown once to an admin whose company isn't set up.
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const isAdmin = role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin;
  const showWizard = !!company && !company.setupCompleted && isAdmin && !wizardDismissed;

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

  // Accordion sidebar — exactly ONE group open at a time. Defaults to the group
  // containing the current route (else the first titled group), so the menu
  // stays short and never needs scrolling.
  const firstTitled = NAV.find((g) => g.title)?.title ?? "";
  const [openGroup, setOpenGroup] = useState<string>(
    () => NAV.find((g) => g.title && g.items.some((i) => i.path === location.pathname))?.title ?? firstTitled,
  );
  const toggleGroup = (t: string) => setOpenGroup((cur) => (cur === t ? "" : t));

  // Opening a route from anywhere (breadcrumb, deep link) auto-expands its group.
  useEffect(() => {
    const g = NAV.find((grp) => grp.title && grp.items.some((i) => i.path === location.pathname));
    if (g) setOpenGroup(g.title);
  }, [location.pathname]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Cashier start-of-day freeze: default ON for cashiers (fail-closed) so the
  // app never flashes before the shift check runs; the initial effect clears it
  // if a shift is already open. Admins are never gated.
  const [registerGate, setRegisterGate] = useState(role === UserRole.Cashier);

  // Auto sign-out an idle till.
  useIdleLogout();
  // Daily local safety backup (offline-resilient, catch-up scheduled).
  useAutoBackup();

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
    void (async () => {
      // Tenant isolation: if the local mirror still holds another company's data
      // (a device switched businesses), wipe it before syncing this one.
      if (companyId) {
        try {
          await isolateCompany(companyId);
        } catch {
          /* non-blocking */
        }
      }
      await doSync();
      // Cashier "start of day" freeze: the whole app stays locked behind
      // RegisterGate until a shift is open (opening cash float recorded). A
      // shift stays open until closed, so this fires once a day (or after a
      // prior shift was closed) — not on every login. Admins are never gated.
      if (role === UserRole.Cashier && companyId && shiftLocationId) {
        try {
          const shift = await localShiftService.getCurrentShift(companyId, shiftLocationId);
          setRegisterGate(!shift);
        } catch {
          /* keep gated on error — fail closed */
        }
      } else {
        setRegisterGate(false);
      }
    })();
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

  // Cashier freeze — the register gate is the ONLY thing rendered until a shift
  // is open, so no app feature (sales, navigation, settings) is reachable first.
  if (registerGate) {
    return (
      <>
        <ScreenBackground />
        <RegisterGate onOpened={() => setRegisterGate(false)} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ScreenBackground />
      {/* Collapsible sidebar — hidden entirely when closed so the content
          area takes the full width. */}
      <aside className={`sidebar h-full w-64 shrink-0 flex-col ${sidebarOpen ? "flex" : "hidden"}`}>
        {/* Company brand — the company name is the single identity here. */}
        <div className="flex items-center gap-3 px-4 py-5">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={companyName}
              className="h-10 w-10 shrink-0 rounded-2xl object-cover shadow-lg"
              style={{ boxShadow: "0 4px 14px rgb(99 102 241 / 0.35)" }}
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-lg"
              style={{ backgroundColor: "rgb(99 102 241)", boxShadow: "0 4px 14px rgb(99 102 241 / 0.4)" }}
            >
              {initial}
            </div>
          )}
          <div className="truncate text-base font-bold leading-tight text-text-primary">{companyName}</div>
        </div>
        <div className="mx-4 border-t border-border" />

        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((group, gi) => {
            const items = group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
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
            ));

            // Ungrouped items (Dashboard) render directly, always visible.
            if (!group.title) return <div key={gi}>{items}</div>;

            const open = openGroup === group.title;
            return (
              <div key={gi} className="pt-1">
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary transition hover:text-primary"
                >
                  <span>{t(group.title)}</span>
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
              title={sidebarOpen ? t("Hide menu") : t("Show menu")}
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
                        {t(c.label)}
                      </button>
                    ) : (
                      <span className={last ? "font-bold text-text-primary" : "font-medium text-text-secondary"}>{t(c.label)}</span>
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
              title={language === "en" ? "Passer en français" : "Switch to English"}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-secondary transition hover:bg-surface"
            >
              {language === "en" ? "FR" : "EN"}
            </button>
            <button
              onClick={doSync}
              disabled={syncing}
              title={t("Sync with the server")}
              className="grid h-9 w-9 place-items-center rounded-full text-sm transition hover:bg-surface disabled:opacity-40"
            >
              {syncing ? "⏳" : "🔄"}
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
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      {showWizard && company ? <SetupWizard company={company} onDone={() => setWizardDismissed(true)} /> : null}
    </div>
  );
}
