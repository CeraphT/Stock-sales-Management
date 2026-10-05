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
--> statement-breakpoint
CREATE INDEX `pending_ops_company_idx` ON `pending_ops` (`company_id`,`created_at`);