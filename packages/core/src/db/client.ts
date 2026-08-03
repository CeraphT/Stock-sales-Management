import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

// "sync" | "async" is left generic (not pinned to one) — expo-sqlite's
// driver reports "sync" (it's backed by a synchronous native binding under
// the hood) while drizzle-orm/sqlite-proxy (desktop's planned driver) is
// "async"; the query-builder surface local/*.ts and sync/*.ts actually use
// (select/insert/update/delete/query.*.find*) is identical either way.
export type AppDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;

// Each platform's own db/client.ts constructs the concrete drizzle instance
// (mobile: drizzle-orm/expo-sqlite, for useLiveQuery reactivity; desktop:
// drizzle-orm/sqlite-proxy over tauri-plugin-sql) and registers it here once
// at startup, so the moved local/* and sync/* business logic can reach it
// without every function taking `db` as a parameter.
let registeredDb: AppDatabase | null = null;

export function initDb(db: AppDatabase) {
  registeredDb = db;
}

export function getDb(): AppDatabase {
  if (!registeredDb) {
    throw new Error("Database not initialized — call initDb() at app startup before any query runs.");
  }
  return registeredDb;
}

// Lets every moved local/*.ts and sync/*.ts file keep its original
// `import { db } from ...; db.query...`/`db.insert(...)` call sites
// completely unchanged — each property access lazily resolves through
// getDb(), so it doesn't matter whether this module was imported before or
// after the owning app called initDb().
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    // Bind to the real instance, not this proxy — drizzle's query builder
    // methods rely on internal `this` state, which would break if `this`
    // resolved to the proxy instead of the actual database object.
    return typeof value === "function" ? value.bind(real) : value;
  },
});
