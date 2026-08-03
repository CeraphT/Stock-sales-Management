import { eq } from "drizzle-orm";

import { syncApi } from "../api/endpoints/sync";
import { db } from "../db/client";
import {
  batches,
  cashRegisterShifts,
  categories,
  companies,
  customers,
  giftCards,
  locations,
  loyaltyAccounts,
  productPackagingLevels,
  products,
  stockMovements,
  suppliers,
  syncState,
  users,
} from "../db/schema";
import type { SyncPullResponse } from "../api/types/sync";

const SYNC_STATE_KEY = "pull";

/** Pulls the full SyncPullResponse and upserts it into the local SQLite
 * mirror, in the same dependency order as the MAUI client's SyncService
 * (Company → Users → Locations → Categories → Suppliers →
 * Customers+LoyaltyAccount → GiftCards → Products+PackagingLevels →
 * Batches → StockMovements) — StockMovements/Batches carry a UserId/
 * LocationId FK, and SQLite enforces foreign keys even without explicit
 * FK constraints declared here, so anything upstream must land first.
 *
 * Deliberately not wrapped in db.transaction() — see the drizzle-orm/
 * expo-sqlite transaction gotcha in CLAUDE.md (silently drops writes).
 * Each statement auto-commits on its own. */
export async function pullAll(companyId: string, locationId: string): Promise<number> {
  const since = await resolveSince(companyId);

  const response = await syncApi.pull(companyId, locationId, since);
  let count = 0;

  await upsertCompany(response.company);

  for (const user of response.users) {
    await db
      .insert(users)
      .values({ id: user.id, companyId, name: user.name, phone: user.phone })
      .onConflictDoUpdate({ target: users.id, set: { name: user.name, phone: user.phone } });
    count++;
  }

  for (const location of response.locations) {
    const values = { id: location.id, companyId, name: location.name, address: location.address, active: location.active };
    await db.insert(locations).values(values).onConflictDoUpdate({ target: locations.id, set: values });
    count++;
  }

  for (const category of response.categories) {
    const values = { id: category.id, companyId, name: category.name, updatedAt: category.updatedAt };
    await db.insert(categories).values(values).onConflictDoUpdate({ target: categories.id, set: values });
    count++;
  }

  for (const supplier of response.suppliers) {
    const values = {
      id: supplier.id,
      companyId,
      name: supplier.name,
      contactPhone: supplier.contactPhone,
      contactEmail: supplier.contactEmail,
      updatedAt: supplier.updatedAt,
    };
    await db.insert(suppliers).values(values).onConflictDoUpdate({ target: suppliers.id, set: values });
    count++;
  }

  for (const customer of response.customers) {
    const values = {
      id: customer.id,
      companyId,
      name: customer.name,
      phone: customer.phone,
      creditBalance: customer.creditBalance,
      updatedAt: customer.updatedAt,
    };
    await db.insert(customers).values(values).onConflictDoUpdate({ target: customers.id, set: values });

    // LoyaltyAccount is meaningless without its Customer — upserted here
    // rather than via a top-level list, same as the server response shape.
    const loyaltyValues = {
      customerId: customer.id,
      pointsBalance: customer.loyaltyPointsBalance,
      storeCreditBalance: customer.loyaltyStoreCreditBalance,
    };
    await db
      .insert(loyaltyAccounts)
      .values(loyaltyValues)
      .onConflictDoUpdate({ target: loyaltyAccounts.customerId, set: loyaltyValues });
    count++;
  }

  for (const card of response.giftCards) {
    const values = {
      id: card.id,
      companyId,
      code: card.code,
      initialValue: card.initialValue,
      remainingValue: card.remainingValue,
      active: card.active,
    };
    await db.insert(giftCards).values(values).onConflictDoUpdate({ target: giftCards.id, set: values });
    count++;
  }

  for (const product of response.products) {
    const values = {
      id: product.id,
      companyId,
      name: product.name,
      barcode: product.barcode,
      categoryId: product.categoryId,
      purchasePrice: product.purchasePrice,
      salePrice: product.salePrice,
      supplierId: product.supplierId,
      isFavorite: product.isFavorite,
      isActive: product.isActive,
      lowStockThreshold: product.lowStockThreshold,
      taxRateOverridePercent: product.taxRateOverridePercent,
      updatedAt: product.updatedAt,
    };
    await db.insert(products).values(values).onConflictDoUpdate({ target: products.id, set: values });

    // Packaging levels have no independent UpdatedAt — the parent
    // Product's UpdatedAt covers them, so a full delete+reinsert per
    // pulled product is simpler than diffing and just as correct.
    await db.delete(productPackagingLevels).where(eq(productPackagingLevels.productId, product.id));
    for (const level of product.packagingLevels) {
      await db.insert(productPackagingLevels).values({
        id: level.id,
        productId: product.id,
        unitName: level.unitName,
        quantityInBaseUnits: level.quantityInBaseUnits,
        salePriceOverride: level.salePriceOverride,
      });
    }
    count++;
  }

  for (const batch of response.batches) {
    const values = {
      id: batch.id,
      productId: batch.productId,
      locationId: batch.locationId,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityInBaseUnits: batch.quantityInBaseUnits,
      purchasePricePerBaseUnit: batch.purchasePricePerBaseUnit,
      updatedAt: batch.updatedAt,
    };
    await db.insert(batches).values(values).onConflictDoUpdate({ target: batches.id, set: values });
    count++;
  }

  for (const movement of response.stockMovements) {
    const existing = await db.query.stockMovements.findFirst({ where: eq(stockMovements.id, movement.id) });
    if (existing) continue;
    await db.insert(stockMovements).values({
      id: movement.id,
      productId: movement.productId,
      batchId: movement.batchId,
      locationId: movement.locationId,
      destinationLocationId: movement.destinationLocationId,
      type: movement.type,
      quantityInBaseUnits: movement.quantityInBaseUnits,
      reason: movement.reason,
      userId: movement.userId,
      timestamp: movement.timestamp,
    });
    count++;
  }

  await db
    .insert(syncState)
    .values({ key: SYNC_STATE_KEY, lastPulledAt: response.serverTimestamp })
    .onConflictDoUpdate({ target: syncState.key, set: { lastPulledAt: response.serverTimestamp } });

  return count;
}

async function upsertCompany(info: SyncPullResponse["company"]): Promise<void> {
  const values = {
    id: info.id,
    name: info.name,
    uniqueCode: info.uniqueCode,
    currency: info.currency,
    defaultTaxRatePercent: info.defaultTaxRatePercent,
    loyaltyEnabled: info.loyaltyEnabled,
    loyaltyEarnRateAmount: info.loyaltyEarnRateAmount,
    loyaltyPointValue: info.loyaltyPointValue,
  };
  await db.insert(companies).values(values).onConflictDoUpdate({ target: companies.id, set: values });
}

// Defensive: the LastPulledAt watermark (syncState) and the local SQLite
// cache are two independent things that can disagree — e.g. the db was
// wiped without the watermark also being cleared, or this device was
// previously used for a different company. Either way, an incremental
// "since X" pull would return almost nothing for THIS company's tables,
// leaving them empty forever. Scope the emptiness check to this company
// specifically, and force a full pull when it comes up empty despite
// having a watermark — mirrors SyncService.PullAsync's same self-heal.
async function resolveSince(companyId: string): Promise<string | null> {
  const stateRow = await db.query.syncState.findFirst({ where: eq(syncState.key, SYNC_STATE_KEY) });
  const since = stateRow?.lastPulledAt ?? null;
  if (since === null) return null;

  const anyProduct = await db.query.products.findFirst({ where: eq(products.companyId, companyId) });
  return anyProduct ? since : null;
}
