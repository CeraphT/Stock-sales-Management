import { initDb, type AppDatabase } from "@stockflow/core/db/client";
import * as schema from "@stockflow/core/db/schema";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";

import migration002 from "./migrations/002_b2b.sql?raw";
import migration003 from "./migrations/003_inventory_capabilities.sql?raw";
import schemaSql from "./schema.sql?raw";

/** Tauri exposes this global inside the native webview; absent in a plain
 * browser (Vite dev). Picks the persistent backend vs the in-memory one. */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let initialized: Promise<void> | null = null;

/** Idempotent. Both environments use drizzle's sqlite-proxy driver so the
 * relational-query field mapping (camelCase) behaves identically — the
 * callback returns POSITIONAL value arrays and drizzle maps them to schema
 * fields itself (the sql-js sync driver returned raw snake_case objects). */
export function initLocalDb(): Promise<void> {
  initialized ??= isTauri() ? initTauriDb() : initBrowserDb();
  return initialized;
}

// --- Native: tauri-plugin-sql (persistent). Tables created by the Rust-side
// migration (src-tauri/src/lib.rs). tauri-plugin-sql returns row objects keyed
// by column (sqlx preserves SELECT order) → Object.values() = positional.
async function initTauriDb(): Promise<void> {
  const Database = (await import("@tauri-apps/plugin-sql")).default;
  const sqlDb = await Database.load("sqlite:pharmastock.db");

  const db = drizzleProxy(
    async (sql, params, method) => {
      // tauri-plugin-sql (sqlx) binds numbered $1,$2 placeholders — drizzle
      // emits `?`, so rewrite them or every insert binds nothing (tables stay
      // empty even though the statement "succeeds").
      let n = 0;
      const q = sql.replace(/\?/g, () => `$${++n}`);
      if (method === "run") {
        await sqlDb.execute(q, params);
        return { rows: [] };
      }
      const objs = await sqlDb.select<Record<string, unknown>[]>(q, params);
      const rows = objs.map((r) => Object.values(r));
      // For "get", an empty result must be undefined — NOT [] — or drizzle's
      // mapGetResult treats [] as a zero-column row and returns a phantom
      // object (all fields undefined) instead of undefined, so every
      // findFirst-with-no-match wrongly looks like a hit.
      if (method === "get") return { rows: (rows.length ? rows[0] : undefined) as unknown as unknown[] };
      return { rows };
    },
    { schema },
  );
  initDb(db as unknown as AppDatabase);
}

// --- Browser (Vite dev / testing): sql.js, in-memory. Resets on reload;
// re-sync repopulates. sql.js prepared statements yield positional arrays
// directly, exactly what sqlite-proxy wants.
async function initBrowserDb(): Promise<void> {
  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqlDb = new SQL.Database();
  sqlDb.run(schemaSql);
  // Post-v1 migrations (native runs these via tauri-plugin-sql). The in-memory
  // browser DB is recreated each load, so apply them right after the base schema.
  sqlDb.run(migration002);
  sqlDb.run(migration003);

  const db = drizzleProxy(
    async (sql, params, method) => {
      if (method === "run") {
        sqlDb.run(sql, params as never[]);
        return { rows: [] };
      }
      const stmt = sqlDb.prepare(sql);
      stmt.bind(params as never[]);
      const rows: unknown[][] = [];
      while (stmt.step()) rows.push(stmt.get() as unknown[]);
      stmt.free();
      // "get" with no row must be undefined, not [] — see the native adapter
      // above: [] makes drizzle mapGetResult return a phantom row.
      if (method === "get") return { rows: (rows.length ? rows[0] : undefined) as unknown as unknown[] };
      return { rows };
    },
    { schema },
  );

  if (import.meta.env.DEV) (window as unknown as { __db: unknown }).__db = db;
  initDb(db as unknown as AppDatabase);
}
