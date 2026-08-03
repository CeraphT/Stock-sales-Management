import { generateId } from "../idGenerator";
import { and, eq } from "drizzle-orm";

import { ApiError } from "../api/client";
import { PaymentMethod, ShiftStatus, SyncStatus } from "../api/enums";
import type { PaymentMethodTotal, ShiftDetailResponse } from "../api/types/shifts";
import { getAuthStore } from "../auth/store";
import { db } from "../db/client";
import { localDbWriteLock } from "../db/writeLock";
import { cashRegisterShifts, locations, paymentSplits, sales, users } from "../db/schema";

async function computeCashTotal(shiftId: string): Promise<number> {
  const shiftSales = await db.query.sales.findMany({ where: eq(sales.shiftId, shiftId) });
  const directCash = shiftSales.filter((s) => s.paymentMethod === PaymentMethod.Cash).reduce((sum, s) => sum + s.total, 0);

  let splitCash = 0;
  for (const sale of shiftSales) {
    const splits = await db.query.paymentSplits.findMany({ where: eq(paymentSplits.saleId, sale.id) });
    splitCash += splits.filter((p) => p.method === PaymentMethod.Cash).reduce((sum, p) => sum + p.amount, 0);
  }

  return directCash + splitCash;
}

async function toDetail(shiftId: string): Promise<ShiftDetailResponse> {
  const shift = await db.query.cashRegisterShifts.findFirst({ where: eq(cashRegisterShifts.id, shiftId) });
  if (!shift) throw new ApiError(404, "Shift not found.");

  const location = await db.query.locations.findFirst({ where: eq(locations.id, shift.locationId) });
  const openedByUser = await db.query.users.findFirst({ where: eq(users.id, shift.openedByUserId) });
  const closedByUser = shift.closedByUserId ? await db.query.users.findFirst({ where: eq(users.id, shift.closedByUserId) }) : undefined;

  const shiftSales = await db.query.sales.findMany({ where: eq(sales.shiftId, shiftId) });
  const totals = new Map<PaymentMethod, number>();
  for (const sale of shiftSales) {
    if (sale.paymentMethod === PaymentMethod.Split) {
      const splits = await db.query.paymentSplits.findMany({ where: eq(paymentSplits.saleId, sale.id) });
      for (const split of splits) {
        totals.set(split.method, (totals.get(split.method) ?? 0) + split.amount);
      }
    } else {
      totals.set(sale.paymentMethod, (totals.get(sale.paymentMethod) ?? 0) + sale.total);
    }
  }
  const paymentBreakdown: PaymentMethodTotal[] = [...totals.entries()]
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => b.total - a.total);

  const totalSales = shiftSales.reduce((sum, s) => sum + s.total, 0);

  return {
    id: shift.id,
    locationId: shift.locationId,
    locationName: location?.name ?? "—",
    openedByName: openedByUser?.name ?? "—",
    closedByName: closedByUser?.name ?? null,
    status: shift.status,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openingCashAmount: shift.openingCashAmount,
    closingCashAmount: shift.closingCashAmount,
    expectedCashAmount: shift.expectedCashAmount,
    discrepancy: shift.discrepancy,
    closingNotes: shift.closingNotes,
    salesCount: shiftSales.length,
    totalSales,
    paymentBreakdown,
  };
}

async function openShiftInternal(companyId: string, locationId: string, openingCashAmount: number): Promise<ShiftDetailResponse> {
  const locationExists = await db.query.locations.findFirst({
    where: and(eq(locations.id, locationId), eq(locations.companyId, companyId)),
  });
  if (!locationExists) throw new ApiError(404, "Location not found.");

  const alreadyOpen = await db.query.cashRegisterShifts.findFirst({
    where: and(eq(cashRegisterShifts.locationId, locationId), eq(cashRegisterShifts.status, ShiftStatus.Open)),
  });
  if (alreadyOpen) throw new ApiError(409, "A shift is already open for this location.");

  const userId = getAuthStore().getState().user?.id;
  if (!userId) throw new ApiError(401, "Local session not found.");

  const shiftId = generateId();
  await db.insert(cashRegisterShifts).values({
    id: shiftId,
    companyId,
    locationId,
    openedByUserId: userId,
    closedByUserId: null,
    status: ShiftStatus.Open,
    openedAt: new Date().toISOString(),
    closedAt: null,
    openingCashAmount,
    closingCashAmount: null,
    expectedCashAmount: null,
    discrepancy: null,
    closingNotes: null,
    syncStatus: SyncStatus.PendingPush,
  });

  return toDetail(shiftId);
}

async function closeShiftInternal(
  companyId: string,
  shiftId: string,
  closingCashAmount: number,
  closingNotes: string | null,
): Promise<ShiftDetailResponse> {
  const shift = await db.query.cashRegisterShifts.findFirst({
    where: and(eq(cashRegisterShifts.id, shiftId), eq(cashRegisterShifts.companyId, companyId)),
  });
  if (!shift) throw new ApiError(404, "Shift not found.");
  if (shift.status === ShiftStatus.Closed) throw new ApiError(400, "This shift is already closed.");

  const userId = getAuthStore().getState().user?.id;
  if (!userId) throw new ApiError(401, "Local session not found.");

  const cashTotal = await computeCashTotal(shiftId);
  const expectedCashAmount = shift.openingCashAmount + cashTotal;
  const discrepancy = closingCashAmount - expectedCashAmount;

  await db
    .update(cashRegisterShifts)
    .set({
      status: ShiftStatus.Closed,
      closedAt: new Date().toISOString(),
      closedByUserId: userId,
      closingCashAmount,
      expectedCashAmount,
      discrepancy,
      closingNotes,
      syncStatus: shift.syncStatus === SyncStatus.Synced ? SyncStatus.PendingPush : shift.syncStatus,
    })
    .where(eq(cashRegisterShifts.id, shiftId));

  return toDetail(shiftId);
}

/** Local-first replacement for the online shift open/close/current
 * endpoints — TS port of the MAUI client's LocalShiftService, including
 * the same already-open pre-check, so shift lifecycle works fully
 * offline. */
export const localShiftService = {
  openShift: (companyId: string, locationId: string, openingCashAmount: number) =>
    localDbWriteLock.run(() => openShiftInternal(companyId, locationId, openingCashAmount)),

  closeShift: (companyId: string, shiftId: string, closingCashAmount: number, closingNotes: string | null) =>
    localDbWriteLock.run(() => closeShiftInternal(companyId, shiftId, closingCashAmount, closingNotes)),

  async getCurrentShift(companyId: string, locationId: string): Promise<ShiftDetailResponse | null> {
    const shift = await db.query.cashRegisterShifts.findFirst({
      where: and(eq(cashRegisterShifts.locationId, locationId), eq(cashRegisterShifts.companyId, companyId), eq(cashRegisterShifts.status, ShiftStatus.Open)),
    });
    return shift ? toDetail(shift.id) : null;
  },
};
