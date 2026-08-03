-- Local SQLite schema for the desktop client. Mirrors @stockflow/core's
-- drizzle schema (identical to the Expo app's 0000 migration). Single source
-- of truth: imported as a raw string by the browser (sql.js) driver AND
-- embedded by the Rust tauri-plugin-sql migration (include_str!).
CREATE TABLE IF NOT EXISTS `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`batch_number` text NOT NULL,
	`expiry_date` text,
	`quantity_in_base_units` integer NOT NULL,
	`purchase_price_per_base_unit` real NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `batches_product_idx` ON `batches` (`product_id`);
CREATE INDEX IF NOT EXISTS `batches_product_location_idx` ON `batches` (`product_id`,`location_id`);
CREATE TABLE IF NOT EXISTS `cash_register_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`location_id` text NOT NULL,
	`opened_by_user_id` text NOT NULL,
	`closed_by_user_id` text,
	`status` integer NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`opening_cash_amount` real NOT NULL,
	`closing_cash_amount` real,
	`expected_cash_amount` real,
	`discrepancy` real,
	`closing_notes` text,
	`sync_status` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unique_code` text NOT NULL,
	`currency` text NOT NULL,
	`default_tax_rate_percent` real NOT NULL,
	`loyalty_enabled` integer NOT NULL,
	`loyalty_earn_rate_amount` real NOT NULL,
	`loyalty_point_value` real NOT NULL
);
CREATE TABLE IF NOT EXISTS `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`credit_balance` real NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `gift_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text NOT NULL,
	`initial_value` real NOT NULL,
	`remaining_value` real NOT NULL,
	`active` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`active` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `loyalty_accounts` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`points_balance` integer NOT NULL,
	`store_credit_balance` real NOT NULL
);
CREATE TABLE IF NOT EXISTS `payment_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`method` integer NOT NULL,
	`amount` real NOT NULL
);
CREATE INDEX IF NOT EXISTS `payment_splits_sale_idx` ON `payment_splits` (`sale_id`);
CREATE TABLE IF NOT EXISTS `product_packaging_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`quantity_in_base_units` integer NOT NULL,
	`sale_price_override` real
);
CREATE INDEX IF NOT EXISTS `packaging_levels_product_idx` ON `product_packaging_levels` (`product_id`);
CREATE TABLE IF NOT EXISTS `products` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`category_id` text,
	`purchase_price` real NOT NULL,
	`sale_price` real NOT NULL,
	`supplier_id` text,
	`is_favorite` integer NOT NULL,
	`is_active` integer NOT NULL,
	`low_stock_threshold` integer NOT NULL,
	`tax_rate_override_percent` real,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `products_barcode_idx` ON `products` (`barcode`);
CREATE INDEX IF NOT EXISTS `products_category_idx` ON `products` (`category_id`);
CREATE TABLE IF NOT EXISTS `sale_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`quantity_in_base_units` integer NOT NULL,
	`packaging_level_id` text,
	`unit_price` real NOT NULL,
	`tax_rate_percent` real NOT NULL
);
CREATE INDEX IF NOT EXISTS `sale_lines_sale_idx` ON `sale_lines` (`sale_id`);
CREATE TABLE IF NOT EXISTS `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`location_id` text NOT NULL,
	`user_id` text NOT NULL,
	`customer_id` text,
	`shift_id` text,
	`total` real NOT NULL,
	`payment_method` integer NOT NULL,
	`status` integer NOT NULL,
	`amount_tendered` real,
	`change_due` real,
	`gift_card_code` text,
	`timestamp` text NOT NULL,
	`sync_status` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `sales_shift_idx` ON `sales` (`shift_id`);
CREATE INDEX IF NOT EXISTS `sales_location_idx` ON `sales` (`location_id`);
CREATE TABLE IF NOT EXISTS `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`location_id` text NOT NULL,
	`destination_location_id` text,
	`type` integer NOT NULL,
	`quantity_in_base_units` integer NOT NULL,
	`reason` text,
	`user_id` text NOT NULL,
	`timestamp` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `stock_movements_location_idx` ON `stock_movements` (`location_id`);
CREATE TABLE IF NOT EXISTS `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_phone` text,
	`contact_email` text,
	`updated_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`last_pulled_at` text
);
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL
);
