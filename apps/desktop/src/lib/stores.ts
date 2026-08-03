import { createAuthStore } from "@stockflow/core/auth/store";
import { createLanguageStore } from "@stockflow/core/i18n/store";

import { generateId, keyValueStorageAdapter, stateStorageAdapter } from "@/platform";

// Creating the stores registers them as @stockflow/core's singletons (the
// api client, sync engine, etc. read them via getAuthStore()/getLanguageStore()).
// This module is imported first — see bootstrap.ts — so the singletons exist
// before any screen or API call touches them.
export const useAuthStore = createAuthStore(stateStorageAdapter, generateId);
export const useLanguageStore = createLanguageStore(keyValueStorageAdapter);
