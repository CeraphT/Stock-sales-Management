CREATE TABLE `remote_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`json` text NOT NULL,
	`saved_at` text NOT NULL
);
