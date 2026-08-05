import { Component, type ErrorInfo, type ReactNode } from "react";
import { useNavigate, useRouteError } from "react-router-dom";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";

/** Turns any thrown value into a readable one-line message. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function reload() {
  window.location.reload();
}

/** Shared crash card. `inShell` keeps it inside the content area (sidebar stays);
 * otherwise it fills the screen (used before/around the shell). */
function CrashCard({
  title,
  detail,
  onHome,
  inShell,
}: {
  title: string;
  detail: string;
  onHome?: () => void;
  inShell: boolean;
}) {
  const t = useT();
  return (
    <div className={`flex ${inShell ? "min-h-[60vh]" : "h-screen"} flex-col items-center justify-center bg-background px-6 text-center`}>
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-sm">
        <div className="text-3xl">⚠️</div>
        <div className="mt-2 text-lg font-bold text-text-primary">{title}</div>
        <p className="mt-1 text-sm text-text-secondary">
          {t("The rest of your data is safe. Try again, or reload the app.")}
        </p>
        {detail ? (
          <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-left text-[11px] text-text-secondary">
            {detail}
          </pre>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onHome ? (
            <Button variant="secondary" onClick={onHome}>
              {t("Back to dashboard")}
            </Button>
          ) : null}
          <Button onClick={reload}>{t("Reload app")}</Button>
        </div>
      </div>
    </div>
  );
}

/** Router errorElement for an authenticated screen. Rendered in place of the
 * content area (the Shell's sidebar/header stay), so one screen crashing never
 * takes down the whole till. Navigating away clears the error automatically. */
export function ScreenErrorFallback() {
  const err = useRouteError();
  const navigate = useNavigate();
  const t = useT();
  // Surface the failure so it isn't swallowed silently.
  console.error("[screen crash]", err);
  return (
    <CrashCard
      inShell
      title={t("Something went wrong on this screen")}
      detail={messageOf(err)}
      onHome={() => navigate("/dashboard")}
    />
  );
}

/** Router errorElement for the top level (public routes, or a crash outside the
 * authenticated shell). Full-screen, reload-only. */
export function RootErrorFallback() {
  const err = useRouteError();
  const t = useT();
  console.error("[app crash]", err);
  return <CrashCard inShell={false} title={t("The app hit an unexpected error")} detail={messageOf(err)} />;
}

/** Last-resort React error boundary for crashes outside the router (providers,
 * hosts). The data router handles route render errors itself; this catches the
 * rest so the window is never left blank. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[fatal crash]", error, info.componentStack);
  }

  render() {
    if (this.state.error != null) {
      // No i18n/router context guaranteed here — keep it plain and dependency-free.
      return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>The app hit an unexpected error</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, maxWidth: 420 }}>Your data is safe. Please reload.</div>
          <button
            onClick={reload}
            style={{ marginTop: 16, padding: "8px 18px", borderRadius: 10, border: "none", background: "#6366f1", color: "white", fontWeight: 600, cursor: "pointer" }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
