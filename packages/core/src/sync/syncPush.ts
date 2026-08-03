import { generateId } from "../idGenerator";
import { and, eq } from "drizzle-orm";

import { syncApi } from "../api/endpoints/sync";
import { StockMovementType, SyncStatus } from "../api/enums";
import type { SyncPushSale, SyncPushShiftClose, SyncPushShiftOpen, SyncPushStockMovement } from "../api/types/sync";
import { getAuthStore } from "../auth/store";
import { db } from "../db/client";
import { cashRegisterShifts, paymentSplits, sales, saleLines } from "../db/schema";

/** Pushes this device's locally-created (PendingPush) Sales/
 * CashRegisterShifts to the server, mirroring SyncService.PushAsync
 * exactly. Returns how many pending items are still unsynced after this
 * attempt (0 means everything pushed cleanly). */
export async function pushAll(companyId: string): Promise<{ pushed: number; failed: number }> {
  const deviceId = getAuthStore().getState().deviceId;

  const pendingSales = await db.query.sales.findMany({
    where: and(eq(sales.companyId, companyId), eq(sales.syncStatus, SyncStatus.PendingPush)),
  });
  const pendingShifts = await db.query.cashRegisterShifts.findMany({
    where: and(eq(cashRegisterShifts.companyId, companyId), eq(cashRegisterShifts.syncStatus, SyncStatus.PendingPush)),
  });

  if (pendingSales.length === 0 && pendingShifts.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  const salesPayload: SyncPushSale[] = [];
  for (const sale of pendingSales) {
    const lines = await db.query.saleLines.findMany({ where: eq(saleLines.saleId, sale.id) });
    const splits = await db.query.paymentSplits.findMany({ where: eq(paymentSplits.saleId, sale.id) });

    // Reconstructed from ProductLines rather than queried from the local
    // stockMovements table directly — same reasoning as the MAUI client's
    // SyncService.PushAsync: createSale() adds exactly one StockMovement
    // per deducted line in lockstep, so a line's own BatchId/
    // QuantityInBaseUnits already carries everything a movement needs, and
    // there's no SaleId FK on StockMovement to query by (matches the
    // server schema).
    const stockMovements: SyncPushStockMovement[] = lines
      .filter((line) => line.batchId !== null)
      .map((line) => ({
        id: generateId(),
        productId: line.productId,
        batchId: line.batchId,
        locationId: sale.locationId,
        destinationLocationId: null,
        type: StockMovementType.Sale,
        quantityInBaseUnits: -line.quantityInBaseUnits,
        reason: null,
        userId: sale.userId,
        timestamp: sale.timestamp,
      }));

    salesPayload.push({
      id: sale.id,
      locationId: sale.locationId,
      userId: sale.userId,
      customerId: sale.customerId,
      shiftId: sale.shiftId,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      amountTendered: sale.amountTendered,
      changeDue: sale.changeDue,
      timestamp: sale.timestamp,
      productLines: lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        batchId: line.batchId,
        quantityInBaseUnits: line.quantityInBaseUnits,
        packagingLevelId: line.packagingLevelId,
        unitPrice: line.unitPrice,
        taxRatePercent: line.taxRatePercent,
      })),
      // Defined server-side but never actually populated by the MAUI
      // client either — service-line sync isn't implemented; always [].
      serviceLines: [],
      paymentSplits: splits.map((split) => ({ id: split.id, method: split.method, amount: split.amount })),
      stockMovements,
      giftCardCode: sale.giftCardCode,
    });
  }

  const shiftOpens: SyncPushShiftOpen[] = pendingShifts.map((shift) => ({
    id: shift.id,
    locationId: shift.locationId,
    openedByUserId: shift.openedByUserId,
    openingCashAmount: shift.openingCashAmount,
    openedAt: shift.openedAt,
  }));
  const shiftCloses: SyncPushShiftClose[] = pendingShifts
    .filter((shift) => shift.closedAt !== null)
    .map((shift) => ({
      shiftId: shift.id,
      closedByUserId: shift.closedByUserId ?? shift.openedByUserId,
      closingCashAmount: shift.closingCashAmount ?? 0,
      closingNotes: shift.closingNotes,
      closedAt: shift.closedAt as string,
    }));

  const response = await syncApi.push(companyId, {
    deviceId,
    sales: salesPayload,
    shiftOpens,
    shiftCloses,
  });

  let failed = 0;
  let pushed = 0;

  for (const sale of pendingSales) {
    const result = response.saleResults.find((r) => r.id === sale.id);
    if (result?.applied) {
      await db.update(sales).set({ syncStatus: SyncStatus.Synced }).where(eq(sales.id, sale.id));
      pushed++;
    } else {
      failed++;
    }
  }

  // A shift only counts as fully synced once every pushed aspect of it
  // (open, and close if applicable) is confirmed applied.
  for (const shift of pendingShifts) {
    const openOk = response.shiftOpenResults.find((r) => r.id === shift.id)?.applied ?? false;
    const closeResult = response.shiftCloseResults.find((r) => r.id === shift.id);
    const closeOk = shift.closedAt === null || (closeResult?.applied ?? false);
    if (openOk && closeOk) {
      await db.update(cashRegisterShifts).set({ syncStatus: SyncStatus.Synced }).where(eq(cashRegisterShifts.id, shift.id));
      pushed++;
    } else {
      failed++;
    }
  }

  return { pushed, failed };
}
