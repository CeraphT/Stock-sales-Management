import { and, eq, inArray } from "drizzle-orm";

import { ApiError, NetworkError } from "../api/client";
import { categoriesApi } from "../api/endpoints/categories";
import { customersApi } from "../api/endpoints/customers";
import { productsApi } from "../api/endpoints/products";
import { suppliersApi } from "../api/endpoints/suppliers";
import { supportApi } from "../api/endpoints/support";
import { db } from "../db/client";
import { batches, categories, customers, loyaltyAccounts, pendingOps, stockMovements, suppliers } from "../db/schema";
import { listPendingOps, type PendingOpKind, type PendingOpPayloads } from "../local/offlineWrites";

export interface OutboxResult {
  opsPushed: number;
  opsFailed: number;
}

/**
 * Drains the offline outbox (see local/offlineWrites.ts), oldest first, by
 * replaying each queued request against its normal API endpoint. Runs at the
 * start of every sync push — BEFORE sales, which may depend on it (stock
 * received offline, then sold offline).
 *
 * - success → the op is removed (the server now has the same ids; the next
 *   pull keeps the local rows in step);
 * - transport failure (NetworkError) or a 5xx → stop and rethrow: nothing is
 *   lost, the remaining ops are retried on the next sync, in order;
 * - any other rejection (validation / conflict, e.g. another device sold the
 *   stock meanwhile) → the op is marked failed with the server's message, its
 *   local effect is reverted so the mirror matches the server again, and the
 *   drain continues with the next op.
 *
 * Must be called inside localDbWriteLock (syncNow does).
 */
export async function pushPendingOps(companyId: string): Promise<OutboxResult> {
  const ops = await listPendingOps(companyId);
  let opsPushed = 0;
  let opsFailed = 0;

  for (const op of ops) {
    const kind = op.kind as PendingOpKind;
    const payload = JSON.parse(op.payload);
    try {
      await replay(companyId, kind, payload);
      await db.delete(pendingOps).where(eq(pendingOps.id, op.id));
      opsPushed++;
    } catch (err) {
      const transient = err instanceof NetworkError || (err instanceof ApiError && err.status >= 500) || !(err instanceof ApiError);
      await db
        .update(pendingOps)
        .set({ attempts: op.attempts + 1, lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(pendingOps.id, op.id));
      if (transient) throw err;

      // Rejected for good: keep it visible, undo its local effect.
      await revert(kind, payload);
      await db.update(pendingOps).set({ failedAt: new Date().toISOString() }).where(eq(pendingOps.id, op.id));
      opsFailed++;
    }
  }
  return { opsPushed, opsFailed };
}

async function replay(companyId: string, kind: PendingOpKind, payload: unknown): Promise<void> {
  switch (kind) {
    case "stock.receive": {
      const p = payload as PendingOpPayloads["stock.receive"];
      await productsApi.receiveStock(companyId, p.productId, p.body);
      return;
    }
    case "stock.adjust": {
      const p = payload as PendingOpPayloads["stock.adjust"];
      await productsApi.adjustStock(companyId, p.productId, p.body);
      return;
    }
    case "stock.count": {
      const p = payload as PendingOpPayloads["stock.count"];
      await productsApi.countStock(companyId, p.body);
      return;
    }
    case "customer.create": {
      const p = payload as PendingOpPayloads["customer.create"];
      await customersApi.create(companyId, p.body);
      return;
    }
    case "supplier.create": {
      const p = payload as PendingOpPayloads["supplier.create"];
      await suppliersApi.create(companyId, p.body);
      return;
    }
    case "category.create": {
      const p = payload as PendingOpPayloads["category.create"];
      await categoriesApi.create(companyId, p.body);
      return;
    }
    case "support.create": {
      const p = payload as PendingOpPayloads["support.create"];
      await supportApi.create(p.body);
      return;
    }
    default:
      // Unknown kind (written by a newer app version?) — reject so it's surfaced.
      throw new ApiError(400, `Unknown offline operation "${kind}".`);
  }
}

/** Undo the local effect of an op the server rejected for good. */
async function revert(kind: PendingOpKind, payload: unknown): Promise<void> {
  switch (kind) {
    case "stock.receive": {
      const p = payload as PendingOpPayloads["stock.receive"];
      await db.delete(stockMovements).where(eq(stockMovements.id, p.body.clientMovementId));
      await db.delete(batches).where(eq(batches.id, p.body.clientBatchId));
      return;
    }
    case "stock.adjust": {
      const p = payload as PendingOpPayloads["stock.adjust"];
      const batch = await db.query.batches.findFirst({ where: eq(batches.id, p.body.batchId) });
      if (batch) {
        await db
          .update(batches)
          .set({ quantityInBaseUnits: Math.max(0, batch.quantityInBaseUnits - p.body.deltaInBaseUnits) })
          .where(eq(batches.id, batch.id));
      }
      await db.delete(stockMovements).where(eq(stockMovements.id, p.body.clientMovementId));
      return;
    }
    case "stock.count": {
      const p = payload as PendingOpPayloads["stock.count"];
      for (const prev of p.previous) {
        await db.update(batches).set({ quantityInBaseUnits: prev.quantity }).where(eq(batches.id, prev.batchId));
      }
      const ids = p.body.lines.map((l) => l.clientMovementId);
      if (ids.length) await db.delete(stockMovements).where(inArray(stockMovements.id, ids));
      return;
    }
    case "customer.create": {
      const p = payload as PendingOpPayloads["customer.create"];
      await db.delete(loyaltyAccounts).where(eq(loyaltyAccounts.customerId, p.body.id));
      await db.delete(customers).where(eq(customers.id, p.body.id));
      return;
    }
    case "supplier.create": {
      const p = payload as PendingOpPayloads["supplier.create"];
      await db.delete(suppliers).where(eq(suppliers.id, p.body.id));
      return;
    }
    case "category.create": {
      const p = payload as PendingOpPayloads["category.create"];
      await db.delete(categories).where(and(eq(categories.id, p.body.id)));
      return;
    }
  }
}
