import { create } from "zustand";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  show: (title: string, message?: string, buttons?: AlertButton[]) => void;
  hide: () => void;
}

export const useAlertStore = create<AlertState>()((set) => ({
  visible: false,
  title: "",
  message: undefined,
  buttons: [],
  show: (title, message, buttons) => set({ visible: true, title, message, buttons: buttons ?? [{ text: "OK" }] }),
  hide: () => set({ visible: false }),
}));

/** Drop-in-ish replacement for React Native's `Alert.alert` — same
 * (title, message?, buttons?) shape, but rendered as a themed in-app
 * modal (`AppAlertHost`, mounted once at the root layout) instead of the
 * OS's native dialog, which ignores the app's light theme and renders
 * dark/black regardless of in-app styling. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  useAlertStore.getState().show(title, message, buttons);
}
