-- v3 — inventory capabilities (weight/measure, serial tracking, variant parent
-- flag) mirrored to the local cache so the offline POS can adapt. Applied on top
-- of schema.sql (v1) + 002 (v2): natively via tauri-plugin-sql (src-tauri/src/
-- lib.rs) and in the browser via initBrowserDb (client.ts). Keep these columns
-- OUT of schema.sql so a fresh native DB doesn't create them in v1 and re-add here.
ALTER TABLE `products` ADD `sell_by_measure` integer NOT NULL DEFAULT 0;
ALTER TABLE `products` ADD `measure_unit` text;
ALTER TABLE `products` ADD `units_per_measure` integer NOT NULL DEFAULT 1;
ALTER TABLE `products` ADD `serial_tracked` integer NOT NULL DEFAULT 0;
ALTER TABLE `products` ADD `has_variants` integer NOT NULL DEFAULT 0;
