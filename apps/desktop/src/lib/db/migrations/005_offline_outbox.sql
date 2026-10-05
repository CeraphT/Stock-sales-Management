-- v5 — offline outbox for non-sale writes (stock receive/adjust/count, create
-- customer/supplier/category): applied locally at once, replayed against the
-- API at the start of every sync push. Same table as the mobile drizzle
-- migration 0004_offline_outbox.sql. Native via tauri-plugin-sql
-- (src-tauri/src/lib.rs), browser via initBrowserDb (client.ts).
CREATE TABLE `pending_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failed_at` text,
	`last_error` text
);
CREATE INDEX `pending_ops_company_idx` ON `pending_ops` (`company_id`,`created_at`);
