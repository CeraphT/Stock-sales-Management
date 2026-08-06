// Side-effect module: inject every platform capability into @stockflow/core
// BEFORE any screen, store, or API call runs. main.tsx imports this first.
import { configureApi, configureOnRemoteWipe } from "@stockflow/core/api/client";
import { clearLocalData } from "@stockflow/core/db/isolation";
import { setIdGenerator } from "@stockflow/core/idGenerator";

import { generateId } from "@/platform";
import { initLocalDb } from "@/lib/db/client";
import { useDbReady } from "@/lib/db/ready";
// Importing stores here creates + registers the auth/language singletons.
import { useLanguageStore } from "@/lib/stores";
// Applies the persisted theme class on <html> at load.
import "@/lib/theme";

configureApi(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5080");
setIdGenerator(generateId);

// When a SuperAdmin remote-wipes this device, erase the local mirror before the
// session is cleared. Reversible from the console (Unblock re-enables login).
configureOnRemoteWipe(async () => {
  await clearLocalData();
});

// Kick off the async language hydrate (non-blocking; defaults to English).
void useLanguageStore.getState().hydrate();

// Construct + register the local SQLite database (sql.js in a browser,
// tauri-plugin-sql natively). The authed app gates on useDbReady.
initLocalDb()
  .then(() => useDbReady.getState().setReady())
  .catch((e) => {
    console.error("Local DB init failed:", e);
    useDbReady.getState().setError(e instanceof Error ? e.message : String(e));
  });
