const APP_NAME = "Desktop";

/** Sponsor credited in the footer of every page (exact spelling). */
export const SPONSOR = "mfSPACE.lu";

/** Version + build commit, injected at build time (vite.config.ts). */
export const APP_BUILD = __APP_BUILD__;

/** "v0.2.0": the version shown to people (the commit stays in the build info
 * and the device heartbeat, not on screen). */
export const APP_VERSION_LABEL = `v${APP_BUILD.version}`;

/** Discreet line shown at the bottom of every page, so anyone can tell which
 * build they are running (support, bug reports). */
export function AppVersion({ className = "" }: { className?: string }) {
  return (
    <div
      className={`select-text py-3 text-center text-[11px] text-text-secondary/70 ${className}`}
      title={`Build ${APP_BUILD.date}`}
    >
      StockFlow {APP_NAME} {APP_VERSION_LABEL} · © {SPONSOR}
    </div>
  );
}
