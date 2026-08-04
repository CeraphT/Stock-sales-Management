import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let seq = 0;

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (not just React components). */
export const toast = (message: string, kind?: ToastKind) => useToast.getState().push(message, kind);
