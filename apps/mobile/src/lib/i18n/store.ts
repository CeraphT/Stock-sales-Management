import * as SecureStore from "expo-secure-store";

import { createLanguageStore, type KeyValueStorage } from "@stockflow/core/i18n/store";

const secureStoreAdapter: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: async (key, value) => {
    await SecureStore.setItemAsync(key, value);
  },
};

export const useLanguageStore = createLanguageStore(secureStoreAdapter);

export type { Language } from "@stockflow/core/i18n/store";
