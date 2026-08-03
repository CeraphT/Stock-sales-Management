import { create, type StoreApi, type UseBoundStore } from "zustand";

export type Language = "en" | "fr";

const KEY = "language_preference";

interface LanguageState {
  language: Language;
  hasHydrated: boolean;
  setLanguage: (value: Language) => void;
  hydrate: () => Promise<void>;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

type LanguageStore = UseBoundStore<StoreApi<LanguageState>>;

// useTranslation() (in this same package) needs to read whichever store
// the app created, without taking it as an argument on every call site —
// same registry pattern as auth/store.ts and db/client.ts.
let registeredStore: LanguageStore | null = null;

export function getLanguageStore(): LanguageStore {
  if (!registeredStore) {
    throw new Error("Language store not initialized — call createLanguageStore() at app startup.");
  }
  return registeredStore;
}

/** Persisted UI language, same shape/backing store as the theme
 * preference (`theme/store.ts`) — English by default, French to match the
 * MAUI client's original strings. `storage` is injected (SecureStore on
 * mobile — language isn't actually sensitive, but reuses the same adapter
 * as auth for simplicity; a plain localStorage-backed adapter is fine on
 * desktop). */
export function createLanguageStore(storage: KeyValueStorage): LanguageStore {
  const store = create<LanguageState>()((set) => ({
    language: "en",
    hasHydrated: false,
    setLanguage: (value) => {
      storage.setItem(KEY, value).catch(() => {});
      set({ language: value });
    },
    hydrate: async () => {
      const stored = await storage.getItem(KEY);
      const language: Language = stored === "fr" ? "fr" : "en";
      set({ language, hasHydrated: true });
    },
  }));

  registeredStore = store;
  return store;
}
