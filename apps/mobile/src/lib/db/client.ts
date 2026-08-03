import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import { initDb } from "@stockflow/core/db/client";

import * as schema from "./schema";

export const sqliteDb = openDatabaseSync("pharmastock.db", { enableChangeListener: true });
export const db = drizzle(sqliteDb, { schema });

// Registers this instance with @stockflow/core so the moved local/*.ts and
// sync/*.ts business logic (which import `db` from core's own db/client)
// resolves to this same expo-sqlite-backed database.
initDb(db);
