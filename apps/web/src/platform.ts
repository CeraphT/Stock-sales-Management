import type { KeyValueStorage } from "@stockflow/core/i18n/store";
import type { StateStorage } from "zustand/middleware";

// --- Storage adapters -------------------------------------------------------
// The Tauri webview persists localStorage per-app on disk, so this is durable
// across launches. It is NOT encrypted, though — TODO(secure): move the auth
// token + refresh token onto the OS keyring via tauri-plugin-stronghold / a
// keyring plugin and expose it behind these same adapter shapes.

export const stateStorageAdapter: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => localStorage.setItem(name, value),
  removeItem: (name) => localStorage.removeItem(name),
};

export const keyValueStorageAdapter: KeyValueStorage = {
  getItem: async (key) => localStorage.getItem(key),
  setItem: async (key, value) => {
    localStorage.setItem(key, value);
  },
};

// --- Device identity --------------------------------------------------------
// A real browser engine (Tauri's webview) has the standard Web Crypto API, so
// unlike mobile (which had to inject expo-crypto to dodge a Hermes crash) we
// use crypto.randomUUID() directly.
export const generateId = () => crypto.randomUUID();

export const deviceName = "PharmaStock Web";
