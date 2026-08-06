import { create } from "zustand";

/** Promise-based confirm dialog — a styled replacement for window.confirm
 * (which renders as an unstyled "localhost:5173 says" browser popup). Call
 * `await confirmDialog({ message })`; it resolves true/false. Labels default to
 * translated OK/Cancel (filled in by ConfirmHost) unless overridden. */
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolver: ((value: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  message: "",
  resolver: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, resolver: resolve, ...opts });
    }),
  respond: (value) => {
    get().resolver?.(value);
    set({ open: false, resolver: null });
  },
}));

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return useConfirm.getState().ask(opts);
}
