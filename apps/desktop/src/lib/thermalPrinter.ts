/** Native ESC/POS transport (Tauri Rust commands in src-tauri/src/lib.rs).
 * Only available in the native desktop build — a plain browser has no serial
 * or socket access, so these no-op / return empty there. The Tauri API is
 * lazy-loaded so it never touches the browser-dev startup bundle. */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export interface ThermalTarget {
  kind: "serial" | "network";
  target: string;
  baud: number;
}

/** A printer the app auto-detected: `target` is the connection handle (COM
 * port), `label` is a friendly name to show the user. */
export interface DetectedPrinter {
  target: string;
  label: string;
}

/** Auto-detect connected thermal printers (USB / USB-C / Bluetooth all surface
 * as serial ports on Windows). The user never types a port or baud rate. */
export async function detectPrinters(): Promise<DetectedPrinter[]> {
  if (!isTauri()) return [];
  try {
    return await tauriInvoke<DetectedPrinter[]>("detect_printers", {});
  } catch {
    return [];
  }
}

/** Write raw bytes to the printer. Throws with a readable message on failure
 * (printer off, wrong port, unreachable host) so the caller can surface it. */
export async function printBytes(bytes: Uint8Array, cfg: ThermalTarget): Promise<void> {
  if (!isTauri()) throw new Error("Thermal printing needs the desktop app.");
  await tauriInvoke("print_bytes", {
    kind: cfg.kind,
    target: cfg.target,
    baud: cfg.baud,
    bytes: Array.from(bytes),
  });
}

/** Check the printer is reachable (opens then closes the port/socket). Throws
 * a readable message if it isn't. */
export async function probePrinter(cfg: ThermalTarget): Promise<void> {
  if (!isTauri()) throw new Error("Thermal printing needs the desktop app.");
  await tauriInvoke("probe_printer", { kind: cfg.kind, target: cfg.target, baud: cfg.baud });
}
