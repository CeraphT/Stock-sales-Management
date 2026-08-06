ALTER TABLE `products` ADD `sell_by_measure` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `measure_unit` text;--> statement-breakpoint
ALTER TABLE `products` ADD `units_per_measure` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `serial_tracked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `has_variants` integer DEFAULT false NOT NULL;