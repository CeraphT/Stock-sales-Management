import { and, eq, gt } from "drizzle-orm";

import { db } from "../db/client";
import { batches } from "../db/schema";

export class InsufficientStockError extends Error {
  constructor(
    public productId: string,
    public requested: number,
    public available: number,
  ) {
    super(`Insufficient stock for product ${productId}: requested ${requested} base units, ${available} available.`);
    this.name = "InsufficientStockError";
  }
}

export interface StockDeductionResult {
  batchId: string;
  quantityInBaseUnits: number;
}

/** FEFO (First-Expired-First-Out) stock rotation — TS port of
 * StockDeductionService.DeductFefoAsync's SQLite branch. Scoped to
 * locationId: a sale at one branch can never draw down stock physically
 * sitting at another. Doesn't touch stockMovements — the caller records
 * those alongside its own SaleLine rows, same division of responsibility
 * as the C# version. Callers must run this inside `localDbWriteLock` —
 * there's no `FOR UPDATE` equivalent here (SQLite has no other writer to
 * lock against but this same process). */
export async function deductFefo(
  productId: string,
  locationId: string,
  quantityInBaseUnits: number,
): Promise<StockDeductionResult[]> {
  if (quantityInBaseUnits <= 0) return [];

  const candidates = await db.query.batches.findMany({
    where: and(eq(batches.productId, productId), eq(batches.locationId, locationId), gt(batches.quantityInBaseUnits, 0)),
  });

  // Oldest-expiry-first, no-expiry batches last — sorted in JS rather than
  // via SQL "NULLS LAST" since per-product batch counts are small and this
  // keeps the ordering rule identical to the C# `OrderBy(b => b.ExpiryDate
  // == null ? 1 : 0).ThenBy(b => b.ExpiryDate)` at a glance.
  candidates.sort((a, b) => {
    if (a.expiryDate === null && b.expiryDate === null) return 0;
    if (a.expiryDate === null) return 1;
    if (b.expiryDate === null) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });

  let remaining = quantityInBaseUnits;
  const results: StockDeductionResult[] = [];

  for (const batch of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityInBaseUnits);
    await db
      .update(batches)
      .set({ quantityInBaseUnits: batch.quantityInBaseUnits - take })
      .where(eq(batches.id, batch.id));
    remaining -= take;
    results.push({ batchId: batch.id, quantityInBaseUnits: take });
  }

  if (remaining > 0) {
    const available = quantityInBaseUnits - remaining;
    throw new InsufficientStockError(productId, quantityInBaseUnits, available);
  }

  return results;
}
