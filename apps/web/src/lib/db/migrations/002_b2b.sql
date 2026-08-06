-- v2 — B2B customers + VAT-added-on-top. Applied on top of schema.sql (v1):
-- natively via a tauri-plugin-sql migration (src-tauri/src/lib.rs) and in the
-- browser via initBrowserDb (client.ts). Keep these columns OUT of schema.sql
-- so a fresh native DB doesn't create them in v1 and then re-add them here.
ALTER TABLE `customers` ADD `tax_id` text;
ALTER TABLE `sales` ADD `tax_added_on_top` integer;
