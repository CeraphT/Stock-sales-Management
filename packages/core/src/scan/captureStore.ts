import { create } from "zustand";

interface ScanCaptureState {
  code: string | null;
  setCode: (code: string) => void;
  clear: () => void;
}

/** One-shot handoff for screens that need a scanned code back (e.g. an
 * "Add product" form's barcode field) rather than the scanner's default
 * behavior of looking the code up and adding it to the cart. Expo Router
 * has no built-in way to return a value from a pushed screen, so this
 * plays the same role a navigation result callback would. */
export const useScanCaptureStore = create<ScanCaptureState>()((set) => ({
  code: null,
  setCode: (code) => set({ code }),
  clear: () => set({ code: null }),
}));
