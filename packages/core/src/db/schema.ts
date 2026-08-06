import { relations } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  uniqueCode: text("unique_code").notNull(),
  currency: text("currency").notNull(),
  defaultTaxRatePercent: real("default_tax_rate_percent").notNull(),
  loyaltyEnabled: integer("loyalty_enabled", { mode: "boolean" }).notNull(),
  loyaltyEarnRateAmount: real("loyalty_earn_rate_amount").notNull(),
  loyaltyPointValue: real("loyalty_point_value").notNull(),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  active: integer("active", { mode: "boolean" }).notNull(),
});

// Minimal cached mirror only — FK-satisfaction + display (cashier name on a
// receipt), never locally-authenticatable. Login always goes through the API.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  companyId: text("company_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  updatedAt: text("updated_at").notNull(),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  creditBalance: real("credit_balance").notNull(),
  taxId: text("tax_id"),
  updatedAt: text("updated_at").notNull(),
});

// One-to-one with customers, kept separate — same reasoning as the server
// schema (loyalty points follow different earn/redeem rules than debt).
export const loyaltyAccounts = sqliteTable("loyalty_accounts", {
  customerId: text("customer_id").primaryKey(),
  pointsBalance: integer("points_balance").notNull(),
  storeCreditBalance: real("store_credit_balance").notNull(),
});

export const giftCards = sqliteTable("gift_cards", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  code: text("code").notNull(),
  initialValue: real("initial_value").notNull(),
  remainingValue: real("remaining_value").notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    name: text("name").notNull(),
    barcode: text("barcode"),
    categoryId: text("category_id"),
    purchasePrice: real("purchase_price").notNull(),
    salePrice: real("sale_price").notNull(),
    supplierId: text("supplier_id"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
    lowStockThreshold: integer("low_stock_threshold").notNull(),
    taxRateOverridePercent: real("tax_rate_override_percent"),
    updatedAt: text("updated_at").notNull(),
    // Inventory-capability fields (mirrored for the offline POS).
    sellByMeasure: integer("sell_by_measure", { mode: "boolean" }).notNull().default(false),
    measureUnit: text("measure_unit"),
    unitsPerMeasure: integer("units_per_measure").notNull().default(1),
    serialTracked: integer("serial_tracked", { mode: "boolean" }).notNull().default(false),
    hasVariants: integer("has_variants", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("products_barcode_idx").on(table.barcode), index("products_category_idx").on(table.categoryId)],
);

export const productPackagingLevels = sqliteTable(
  "product_packaging_levels",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    unitName: text("unit_name").notNull(),
    quantityInBaseUnits: integer("quantity_in_base_units").notNull(),
    salePriceOverride: real("sale_price_override"),
  },
  (table) => [index("packaging_levels_product_idx").on(table.productId)],
);

export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    locationId: text("location_id").notNull(),
    batchNumber: text("batch_number").notNull(),
    expiryDate: text("expiry_date"),
    quantityInBaseUnits: integer("quantity_in_base_units").notNull(),
    purchasePricePerBaseUnit: real("purchase_price_per_base_unit").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("batches_product_idx").on(table.productId),
    index("batches_product_location_idx").on(table.productId, table.locationId),
  ],
);

// Immutable/append-only, same as the server — Timestamp is its own change
// marker, no UpdatedAt needed.
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    batchId: text("batch_id"),
    locationId: text("location_id").notNull(),
    destinationLocationId: text("destination_location_id"),
    type: integer("type").notNull(),
    quantityInBaseUnits: integer("quantity_in_base_units").notNull(),
    reason: text("reason"),
    userId: text("user_id").notNull(),
    timestamp: text("timestamp").notNull(),
  },
  (table) => [index("stock_movements_location_idx").on(table.locationId)],
);

export const cashRegisterShifts = sqliteTable("cash_register_shifts", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  locationId: text("location_id").notNull(),
  openedByUserId: text("opened_by_user_id").notNull(),
  closedByUserId: text("closed_by_user_id"),
  status: integer("status").notNull(),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  openingCashAmount: real("opening_cash_amount").notNull(),
  closingCashAmount: real("closing_cash_amount"),
  expectedCashAmount: real("expected_cash_amount"),
  discrepancy: real("discrepancy"),
  closingNotes: text("closing_notes"),
  // Local-only bookkeeping (not part of SyncPullResponse) — Synced=0,
  // PendingPush=1. Anything landing via sync pull is already server-side
  // truth and gets written as Synced by definition.
  syncStatus: integer("sync_status").notNull(),
});

export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    locationId: text("location_id").notNull(),
    userId: text("user_id").notNull(),
    customerId: text("customer_id"),
    shiftId: text("shift_id"),
    total: real("total").notNull(),
    paymentMethod: integer("payment_method").notNull(),
    status: integer("status").notNull(),
    amountTendered: real("amount_tendered"),
    changeDue: real("change_due"),
    giftCardCode: text("gift_card_code"),
    timestamp: text("timestamp").notNull(),
    // B2B sale — VAT added on top (see salesService). Nullable for rows created
    // before this column existed; read with `?? false`.
    taxAddedOnTop: integer("tax_added_on_top", { mode: "boolean" }),
    // Local-only, same meaning as cashRegisterShifts.syncStatus above.
    syncStatus: integer("sync_status").notNull(),
  },
  (table) => [index("sales_shift_idx").on(table.shiftId), index("sales_location_idx").on(table.locationId)],
);

export const saleLines = sqliteTable(
  "sale_lines",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id").notNull(),
    productId: text("product_id").notNull(),
    batchId: text("batch_id"),
    quantityInBaseUnits: integer("quantity_in_base_units").notNull(),
    packagingLevelId: text("packaging_level_id"),
    unitPrice: real("unit_price").notNull(),
    taxRatePercent: real("tax_rate_percent").notNull(),
  },
  (table) => [index("sale_lines_sale_idx").on(table.saleId)],
);

export const paymentSplits = sqliteTable(
  "payment_splits",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id").notNull(),
    method: integer("method").notNull(),
    amount: real("amount").notNull(),
  },
  (table) => [index("payment_splits_sale_idx").on(table.saleId)],
);

// Bookkeeping for incremental sync — tracks the server's `ServerTimestamp`
// from the last successful pull so the next pull can send `since` and only
// fetch what changed.
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  lastPulledAt: text("last_pulled_at"),
});

export const productsRelations = relations(products, ({ many }) => ({
  packagingLevels: many(productPackagingLevels),
  batches: many(batches),
}));

export const productPackagingLevelsRelations = relations(productPackagingLevels, ({ one }) => ({
  product: one(products, { fields: [productPackagingLevels.productId], references: [products.id] }),
}));

export const batchesRelations = relations(batches, ({ one }) => ({
  product: one(products, { fields: [batches.productId], references: [products.id] }),
}));

export const salesRelations = relations(sales, ({ many }) => ({
  productLines: many(saleLines),
  paymentSplits: many(paymentSplits),
}));

export const saleLinesRelations = relations(saleLines, ({ one }) => ({
  sale: one(sales, { fields: [saleLines.saleId], references: [sales.id] }),
}));

export const paymentSplitsRelations = relations(paymentSplits, ({ one }) => ({
  sale: one(sales, { fields: [paymentSplits.saleId], references: [sales.id] }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  loyaltyAccount: one(loyaltyAccounts, { fields: [customers.id], references: [loyaltyAccounts.customerId] }),
}));
