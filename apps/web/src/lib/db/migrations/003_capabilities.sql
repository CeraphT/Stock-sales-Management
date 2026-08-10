-- v3 — inventory-capability fields on products (weight/measure selling, serial
-- tracking, variants). Mirrors @stockflow/core's drizzle products schema so the
-- offline sync upsert (syncPull) can bind these columns. Applied on top of
-- schema.sql (v1) + 002 (v2): natively via a tauri-plugin-sql migration
-- (src-tauri/src/lib.rs) and in the browser via initBrowserDb (client.ts). Kept
-- OUT of schema.sql so a fresh native DB doesn't create them in v1 and then
-- re-add them here.
ALTER TABLE `products` ADD `sell_by_measure` integer NOT NULL DEFAULT 0;
ALTER TABLE `products` ADD `measure_unit` text;
ALTER TABLE `products` ADD `units_per_measure` integer NOT NULL DEFAULT 1;
ALTER TABLE `products` ADD `serial_tracked` integer NOT NULL DEFAULT 0;
ALTER TABLE `products` ADD `has_variants` integer NOT NULL DEFAULT 0;
