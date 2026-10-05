-- v6 — offline B: last successful answer of server-only reads (reports,
-- purchase orders, services…), shown offline with its date. Same table as the
-- mobile drizzle migration 0005_remote_cache.sql.
CREATE TABLE `remote_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`json` text NOT NULL,
	`saved_at` text NOT NULL
);
