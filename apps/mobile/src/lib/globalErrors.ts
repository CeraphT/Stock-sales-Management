/** Catches uncaught JS errors that escape React's render tree (event handlers,
 * timers, async code) so they're logged instead of vanishing. React error
 * boundaries only catch render errors; this is the mobile analogue of desktop's
 * lib/globalErrors.ts. We chain to React Native's existing global handler so the
 * dev redbox and any crash reporting still fire.
 *
 * In dev it ALSO mirrors console.warn/console.error into our own toast, because
 * React Native's built-in LogBox notification (the tiny "!" badge) is easy to
 * miss — a toast surfaces the same warnings/errors where you're already looking.
 * Dev-only: real users must never see internal console messages. */

import { toast } from '@/lib/ui/toastStore';

// RN exposes ErrorUtils as a global; it isn't in the TS lib types.
declare const ErrorUtils:
  | {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    }
  | undefined;

let installed = false;

function describe(arg: unknown): string {
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Mirror dev console.warn/error into a toast — deduped (same message within a
 * few seconds is dropped) and re-entrancy-guarded so a toast-render error can't
 * loop back through console into an infinite toast storm. */
function installDevLogToasts(): void {
  if (!__DEV__) return;

  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const recent = new Map<string, number>();
  let inHandler = false;

  const surface = (kind: 'info' | 'error', args: unknown[]): void => {
    if (inHandler) return;
    inHandler = true;
    try {
      const message = args.map(describe).join(' ').trim().slice(0, 200);
      if (!message) return;
      const now = Date.now();
      const last = recent.get(message) ?? 0;
      if (now - last < 4000) return; // dedupe bursts of the same message
      recent.set(message, now);
      // Defer the toast to a fresh task. console.error/warn is often emitted by
      // React/NativeWind DURING render/commit (e.g. on a theme flip); pushing to
      // the toast store synchronously there re-enters React and can escalate a
      // harmless warning into a full error-boundary crash. setTimeout(0) moves
      // the state update out of the current render entirely.
      setTimeout(() => toast(message, kind), 0);
    } catch {
      /* never let toast surfacing break logging */
    } finally {
      inHandler = false;
    }
  };

  console.warn = (...args: unknown[]) => {
    surface('info', args);
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    surface('error', args);
    origError(...args);
  };
}

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  installDevLogToasts();

  if (typeof ErrorUtils === 'undefined' || !ErrorUtils.setGlobalHandler) return;

  const previous = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    // In dev this console.error is mirrored to a toast by the patch above.
    console.error('[global error]', isFatal ? '(fatal)' : '', error);
    // Preserve RN's default behaviour (redbox in dev, crash reporting in prod).
    previous?.(error, isFatal);
  });
}
