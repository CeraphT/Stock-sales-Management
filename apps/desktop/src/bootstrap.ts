// Side-effect module: inject every platform capability into @stockflow/core
// BEFORE any screen, store, or API call runs. main.tsx imports this first.
import { configureApi } from "@stockflow/core/api/client";
import { setIdGenerator } from "@stockflow/core/idGenerator";

import { generateId } from "@/platform";
// Importing stores here creates + registers the auth/language singletons.
import { useLanguageStore } from "@/lib/stores";
// Applies the persisted theme class on <html> at load.
import "@/lib/theme";

configureApi(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5080");
setIdGenerator(generateId);

// Kick off the async language hydrate (non-blocking; defaults to English).
void useLanguageStore.getState().hydrate();
