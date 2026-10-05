import { and, asc, eq, isNull } from "drizzle-orm";

import { ApiError } from "../api/client";
import { StockMovementType } from "../api/enums";
import type {
  AdjustStockRequest,
  CategoryRequest,
  ReceiveStockRequest,
  StockCountLine,
  SupplierRequest,
} from "../api/types/catalog";
import type { CustomerRequest } from "../api/types/customers";
import { getAuthStore } from "../auth/store";
import { db } from "../db/client";
import { batches, categories, customers, loyaltyAccounts, pendingOps, products, stockMovements, suppliers } from "../db/schema";
import { localDbWriteLock } from "../db/writeLock";
import { generateId } from "../idGenerator";

/**
 * Offline-capable writes for the everyday back-office operations (offline C):
 * stock receive / adjust / count and creating a customer, supplier or
 * category. Each call
 *   1. applies the change to the local mirror immediately (so stock levels,
 *      FEFO, pickers… reflect it with no network), and
 *   2. queues the exact API request in `pending_ops`, with client-generated
 *      ids that make the server-side replay idempotent.
 * The queue is drained by `pushPendingOps` (sync/outboxPush.ts) at the start of
 * every sync push, before sales. Online, the caller just triggers a sync right
 * after, so the same path is used whether or not there's a connection.
 *
 * Validation mirrors the server's rules that can be checked locally; anything
 * only the server can know (another device sold the stock meanwhile, a
 * duplicate category name, …) surfaces when the op is replayed — it is then
 * marked failed and its local effect reverted (see outboxPush.ts).
 */

export type PendingOpKind = "stock.receive" | "stock.adjust" | "stock.count" | "customer.create" | "supplier.create" | "category.create";

export interface PendingOpPayloads {
  "stock.receive": { productId: string; body: ReceiveStockRequest & { clientBatchId: string; clientMovementId: string } };
  "stock.adjust": { productId: string; body: AdjustStockRequest & { clientMovementId: string } };
  "stock.count": { body: { lines: (StockCountLine & { clientMovementId: string })[] }; previous: { batchId: string; quantity: number }[] };
  "customer.create": { body: CustomerRequest & { id: string } };
  "supplier.create": { body: SupplierRequest & { id: string } };
  "category.create": { body: CategoryRequest & { id: string } };
}

const now = () => new Date().toISOString();

function currentUserId(): string {
  const userId = getAuthStore().getState().user?.id;
  if (!userId) throw new ApiError(401, "Local session not found.");
  return userId;
}

async function enqueue<K extends PendingOpKind>(companyId: string, kind: K, payload: PendingOpPayloads[K]): Promise<void> {
  await db.insert(pendingOps).values({
    id: generateId(),
    companyId,
    kind,
    payload: JSON.stringify(payload),
    createdAt: now(),
    attempts: 0,
  });
}

export const offlineWrites = {
  /** Receive a delivery: a new local batch + Entry movement, queued. Serial-
   * tracked products are NOT supported offline (serials must be checked for
   * duplicates server-side) — callers keep the online path for those. */
  receiveStock: (companyId: string, productId: string, request: ReceiveStockRequest) =>
    localDbWriteLock.run(async () => {
      if (request.quantityInBaseUnits <= 0) throw new ApiError(400, "La quantité doit être positive.");
      if (!request.batchNumber.trim()) throw new ApiError(400, "Le numéro de lot est requis.");
      const product = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.companyId, companyId)) });
      if (!product) throw new ApiError(404, "Produit introuvable localement — synchronisez avant de continuer hors ligne.");
      if (!product.isActive) throw new ApiError(400, "Ce produit est archivé et ne peut plus recevoir de stock.");
      if (product.serialTracked) throw new ApiError(400, "Les produits suivis par numéro de série nécessitent une connexion pour la réception.");

      const clientBatchId = generateId();
      const clientMovementId = generateId();
      const ts = now();
      await db.insert(batches).values({
        id: clientBatchId,
        productId,
        locationId: request.locationId,
        batchNumber: request.batchNumber.trim(),
        expiryDate: request.expiryDate,
        quantityInBaseUnits: request.quantityInBaseUnits,
        purchasePricePerBaseUnit: request.purchasePricePerBaseUnit ?? product.purchasePrice,
        updatedAt: ts,
      });
      await db.insert(stockMovements).values({
        id: clientMovementId,
        productId,
        batchId: clientBatchId,
        locationId: request.locationId,
        type: StockMovementType.Entry,
        quantityInBaseUnits: request.quantityInBaseUnits,
        userId: currentUserId(),
        timestamp: ts,
      });
      await enqueue(companyId, "stock.receive", {
        productId,
        body: { ...request, batchNumber: request.batchNumber.trim(), clientBatchId, clientMovementId },
      });
      return { batchId: clientBatchId };
    }),

  /** Manual adjustment (breakage, theft…): updates the local batch, queued. */
  adjustStock: (companyId: string, productId: string, request: AdjustStockRequest) =>
    localDbWriteLock.run(async () => {
      if (request.deltaInBaseUnits === 0) throw new ApiError(400, "La variation doit être différente de zéro.");
      if (!request.reason.trim()) throw new ApiError(400, "Un motif est requis pour un ajustement manuel.");
      const batch = await db.query.batches.findFirst({ where: and(eq(batches.id, request.batchId), eq(batches.productId, productId)) });
      if (!batch) throw new ApiError(404, "Lot introuvable pour ce produit.");
      const newBalance = batch.quantityInBaseUnits + request.deltaInBaseUnits;
      if (newBalance < 0) {
        throw new ApiError(409, `Cet ajustement rendrait le solde du lot négatif (${batch.quantityInBaseUnits} + ${request.deltaInBaseUnits}).`);
      }

      const clientMovementId = generateId();
      const ts = now();
      await db.update(batches).set({ quantityInBaseUnits: newBalance, updatedAt: ts }).where(eq(batches.id, batch.id));
      await db.insert(stockMovements).values({
        id: clientMovementId,
        productId,
        batchId: batch.id,
        locationId: batch.locationId,
        type: StockMovementType.Adjustment,
        quantityInBaseUnits: request.deltaInBaseUnits,
        reason: request.reason.trim(),
        userId: currentUserId(),
        timestamp: ts,
      });
      await enqueue(companyId, "stock.adjust", { productId, body: { ...request, reason: request.reason.trim(), clientMovementId } });
      return { newBalance };
    }),

  /** Physical count: sets each counted batch to the counted quantity locally,
   * queued as ONE op (the server applies counted − its own current qty). */
  countStock: (companyId: string, lines: StockCountLine[]) =>
    localDbWriteLock.run(async () => {
      const valid = lines.filter((l) => l.countedQuantityInBaseUnits >= 0);
      if (valid.length === 0) throw new ApiError(400, "Aucune ligne de comptage fournie.");
      const userId = currentUserId();
      const ts = now();
      const queued: (StockCountLine & { clientMovementId: string })[] = [];
      const previous: { batchId: string; quantity: number }[] = [];
      const results: { batchId: string; before: number; counted: number; delta: number }[] = [];
      for (const line of valid) {
        const batch = await db.query.batches.findFirst({ where: eq(batches.id, line.batchId) });
        if (!batch) throw new ApiError(400, "Un ou plusieurs lots sont introuvables.");
        const delta = line.countedQuantityInBaseUnits - batch.quantityInBaseUnits;
        results.push({ batchId: batch.id, before: batch.quantityInBaseUnits, counted: line.countedQuantityInBaseUnits, delta });
        const clientMovementId = generateId();
        queued.push({ ...line, clientMovementId });
        if (delta === 0) continue;
        previous.push({ batchId: batch.id, quantity: batch.quantityInBaseUnits });
        await db.update(batches).set({ quantityInBaseUnits: line.countedQuantityInBaseUnits, updatedAt: ts }).where(eq(batches.id, batch.id));
        await db.insert(stockMovements).values({
          id: clientMovementId,
          productId: batch.productId,
          batchId: batch.id,
          locationId: batch.locationId,
          type: StockMovementType.StockCount,
          quantityInBaseUnits: delta,
          reason: "Stock count",
          userId,
          timestamp: ts,
        });
      }
      await enqueue(companyId, "stock.count", { body: { lines: queued }, previous });
      return results;
    }),

  createCustomer: (companyId: string, request: CustomerRequest) =>
    localDbWriteLock.run(async () => {
      if (!request.name.trim()) throw new ApiError(400, "Le nom du client est requis.");
      const id = generateId();
      const body = {
        ...request,
        id,
        name: request.name.trim(),
        phone: request.phone?.trim() || null,
        taxId: request.taxId?.trim() || null,
      };
      await db.insert(customers).values({
        id,
        companyId,
        name: body.name,
        phone: body.phone,
        creditBalance: 0,
        taxId: body.taxId,
        isBusiness: body.isBusiness ?? false,
        updatedAt: now(),
      });
      await db.insert(loyaltyAccounts).values({ customerId: id, pointsBalance: 0, storeCreditBalance: 0 }).onConflictDoNothing();
      await enqueue(companyId, "customer.create", { body });
      return { id };
    }),

  createSupplier: (companyId: string, request: SupplierRequest) =>
    localDbWriteLock.run(async () => {
      if (!request.name.trim()) throw new ApiError(400, "Le nom du fournisseur est requis.");
      const id = generateId();
      const body = {
        ...request,
        id,
        name: request.name.trim(),
        contactPhone: request.contactPhone?.trim() || null,
        contactEmail: request.contactEmail?.trim() || null,
      };
      await db.insert(suppliers).values({
        id,
        companyId,
        name: body.name,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        updatedAt: now(),
      });
      await enqueue(companyId, "supplier.create", { body });
      return { id };
    }),

  createCategory: (companyId: string, request: CategoryRequest) =>
    localDbWriteLock.run(async () => {
      const name = request.name.trim();
      if (!name) throw new ApiError(400, "Le nom de la catégorie est requis.");
      const clash = await db.query.categories.findFirst({ where: and(eq(categories.companyId, companyId), eq(categories.name, name)) });
      if (clash) throw new ApiError(409, `Une catégorie nommée « ${name} » existe déjà.`);
      const id = generateId();
      await db.insert(categories).values({ id, companyId, name, updatedAt: now() });
      await enqueue(companyId, "category.create", { body: { name, id } });
      return { id };
    }),

  /** Ops still waiting to be sent, and ops the server rejected for good. */
  async counts(companyId: string): Promise<{ pending: number; failed: number }> {
    const rows = await db.query.pendingOps.findMany({ where: eq(pendingOps.companyId, companyId) });
    return { pending: rows.filter((r) => !r.failedAt).length, failed: rows.filter((r) => !!r.failedAt).length };
  },

  async listFailed(companyId: string) {
    const rows = await db.query.pendingOps.findMany({
      where: eq(pendingOps.companyId, companyId),
      orderBy: [asc(pendingOps.createdAt)],
    });
    return rows.filter((r) => !!r.failedAt).map((r) => ({ id: r.id, kind: r.kind as PendingOpKind, createdAt: r.createdAt, error: r.lastError }));
  },

  /** Dismiss a failed op once the user has seen it. */
  dismissFailed: (opId: string) =>
    localDbWriteLock.run(async () => {
      await db.delete(pendingOps).where(eq(pendingOps.id, opId));
    }),
};

/** Pending (not failed) ops for a company, oldest first. */
export async function listPendingOps(companyId: string) {
  return db.query.pendingOps.findMany({
    where: and(eq(pendingOps.companyId, companyId), isNull(pendingOps.failedAt)),
    orderBy: [asc(pendingOps.createdAt)],
  });
}
