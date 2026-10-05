-- v4 — offline B2B: mirror Customer.IsBusiness (VAT added on top at checkout
-- must be right for an OFFLINE sale) and GiftCard.CreatedAt. Applied on top of
-- schema.sql like 002/003: natively via a tauri-plugin-sql migration
-- (src-tauri/src/lib.rs) and in the browser via initBrowserDb (client.ts).
-- Same columns as the mobile drizzle migration 0003_sync_customer_b2b.sql.
ALTER TABLE `customers` ADD `is_business` integer DEFAULT false NOT NULL;
ALTER TABLE `gift_cards` ADD `created_at` text;
