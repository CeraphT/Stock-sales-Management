/** Catches uncaught JS errors that escape React's render tree (event handlers,
 * timers, async code) so they're logged instead of vanishing. React error
 * boundaries only catch render errors; this is the mobile analogue of desktop's
 * lib/globalErrors.ts. We chain to React Native's existing global handler so the
 * dev redbox and any crash reporting still fire. */

// RN exposes ErrorUtils as a global; it isn't in the TS lib types.
declare const ErrorUtils:
  | {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    }
  | undefined;

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  if (typeof ErrorUtils === 'undefined' || !ErrorUtils.setGlobalHandler) return;

  const previous = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[global error]', isFatal ? '(fatal)' : '', error);
    // Preserve RN's default behaviour (redbox in dev, crash reporting in prod).
    previous?.(error, isFatal);
  });
}
