import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

import { createAuthStore } from "@stockflow/core/auth/store";

// expo-secure-store's get/set/delete already match zustand persist's
// StateStorage shape closely enough — just need setItem/removeItem to
// resolve to void instead of the boolean SecureStore returns.
const secureStoreAdapter: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAuthStore = createAuthStore(secureStoreAdapter, () => Crypto.randomUUID());

export type { AuthState } from "@stockflow/core/auth/store";
