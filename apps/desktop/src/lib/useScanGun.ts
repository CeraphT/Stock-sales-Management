import { useEffect, useRef } from "react";

/**
 * Hardware barcode scanners (USB/Bluetooth HID) behave like a keyboard that
 * "types" the code very fast and ends with Enter. This hook watches global
 * keystrokes and, when it sees a fast burst terminated by Enter, calls
 * `onScan(code)` — so a plugged-in scanner works anywhere on the screen with
 * zero setup, without stealing normal (human-speed) typing.
 *
 * Human typing is far slower than a scanner: consecutive scanner keystrokes
 * arrive within a few ms, so we reset the buffer whenever the gap exceeds
 * `gapMs`. That timing gate is what distinguishes a scan from someone typing a
 * number into a field and pressing Enter.
 */
export function useScanGun(onScan: (code: string) => void, opts?: { enabled?: boolean; gapMs?: number; minLength?: number }) {
  const enabled = opts?.enabled ?? true;
  const gapMs = opts?.gapMs ?? 35;
  const minLength = opts?.minLength ?? 3;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    let fastCount = 0;

    function onKeyDown(e: KeyboardEvent) {
      // Ignore modifier combos (Ctrl/Alt/Meta) — scanners send plain keys.
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      const gap = now - last;
      last = now;

      if (e.key === "Enter") {
        // Treat as a scan only if the burst was long enough AND mostly fast —
        // i.e. it looks machine-typed, not a human pressing Enter in a field.
        if (buffer.length >= minLength && fastCount >= buffer.length - 1) {
          const code = buffer;
          buffer = "";
          fastCount = 0;
          onScanRef.current(code);
        } else {
          buffer = "";
          fastCount = 0;
        }
        return;
      }

      if (e.key.length === 1) {
        if (gap > gapMs) {
          buffer = "";
          fastCount = 0;
        } else {
          fastCount += 1;
        }
        buffer += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, gapMs, minLength]);
}
