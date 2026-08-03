import { generateId } from "../idGenerator";
import { and, desc, eq } from "drizzle-orm";

import { ApiError } from "../api/client";
import { PaymentMethod, SaleStatus, ShiftStatus, StockMovementType, SyncStatus } from "../api/enums";
import type {
  CreateSaleRequest,
  HeldSaleSummaryResponse,
  HoldSaleRequest,
  PaymentSplitResponse,
  SaleDetailResponse,
  SaleLineResponse,
  SaleResponse,
} from "../api/types/sales";
import { getAuthStore } from "../auth/store";
import { db } from "../db/client";
import { localDbWriteLock } from "../db/writeLock";
import {
  batches,
  cashRegisterShifts,
  companies,
  customers,
  giftCards,
  loyaltyAccounts,
  locations,
  paymentSplits,
  productPackagingLevels,
  products,
  saleLines,
  sales,
  stockMovements,
  users,
} from "../db/schema";
import { deductFefo } from "./stockDeduction";

interface ResolvedLine {
  productId: string;
  productName: string;
  packagingLevelId: string | null;
  packagingLevelUnitName: string | null;
  unitsPerRequestedQuantity: number;
  quantityInBaseUnits: number;
  unitPrice: number;
  taxRatePercent: number;
}

function splitAmountOr(request: CreateSaleRequest, method: PaymentMethod, total: number): number {
  if (request.paymentSplits && request.paymentSplits.length > 0) {
    return request.paymentSplits.filter((s) => s.method === method).reduce((sum, s) => sum + s.amount, 0);
  }
  return request.paymentMethod === method ? total : 0;
}

/** createSale's actual body — kept as a standalone function (rather than
 * inline in the exported object) purely so `createSale` itself can wrap
 * the call in `localDbWriteLock.run(...)` without fighting `this` binding
 * inside an object literal.
 *
 * Deviation from the C# LocalSalesService.CreateSaleAsync: that one wraps
 * the whole method in one SQLite transaction, so any failure (insufficient
 * stock on line 2 of 3, an invalid gift card, a payment-split mismatch)
 * rolls back cleanly. drizzle-orm's expo-sqlite transaction support
 * silently drops writes (see the gotcha in CLAUDE.md), so there is no real
 * rollback available here. To keep the same effective safety, every
 * validation — including a total-quantity-available pre-check per line —
 * runs BEFORE any write happens, so a request that's going to fail never
 * touches the database in the first place. */
async function createSaleInternal(companyId: string, request: CreateSaleRequest): Promise<SaleResponse> {
  const productLines = request.productLines ?? [];
  if (productLines.length === 0) {
    throw new ApiError(400, "A sale must contain at least one product line.");
  }
  if (productLines.some((l) => l.quantity <= 0)) {
    throw new ApiError(400, "Line quantities must be positive.");
  }

  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  if (!company) throw new ApiError(404, "Business not found locally — sync before continuing offline.");

  if (request.customerId) {
    const customerExists = await db.query.customers.findFirst({
      where: and(eq(customers.id, request.customerId), eq(customers.companyId, companyId)),
    });
    if (!customerExists) throw new ApiError(404, "Customer not found.");
  }

  const locationExists = await db.query.locations.findFirst({
    where: and(eq(locations.id, request.locationId), eq(locations.companyId, companyId)),
  });
  if (!locationExists) throw new ApiError(404, "Location not found.");

  const userId = getAuthStore().getState().user?.id;
  if (!userId) throw new ApiError(401, "Local session not found.");

  // --- Resolve + validate every line before writing anything ---
  const resolved: ResolvedLine[] = [];
  for (const line of productLines) {
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, line.productId), eq(products.companyId, companyId), eq(products.isActive, true)),
    });
    if (!product) throw new ApiError(404, `Product ${line.productId} not found.`);

    let level: { id: string; unitName: string; quantityInBaseUnits: number; salePriceOverride: number | null } | undefined;
    if (line.packagingLevelId) {
      level = await db.query.productPackagingLevels.findFirst({
        where: and(eq(productPackagingLevels.id, line.packagingLevelId), eq(productPackagingLevels.productId, product.id)),
      });
      if (!level) throw new ApiError(400, `Packaging level ${line.packagingLevelId} does not belong to product ${product.id}.`);
    }

    const unitsPerRequestedQuantity = level?.quantityInBaseUnits ?? 1;
    const quantityInBaseUnits = line.quantity * unitsPerRequestedQuantity;
    const unitPrice = level
      ? (level.salePriceOverride ?? product.salePrice * level.quantityInBaseUnits) / level.quantityInBaseUnits
      : product.salePrice;
    const taxRatePercent = product.taxRateOverridePercent ?? company.defaultTaxRatePercent;

    const productBatches = await db.query.batches.findMany({
      where: and(eq(batches.productId, product.id), eq(batches.locationId, request.locationId)),
    });
    const totalAvailable = productBatches.reduce((sum, b) => sum + b.quantityInBaseUnits, 0);
    if (totalAvailable < quantityInBaseUnits) {
      throw new ApiError(
        409,
        `Insufficient stock for "${product.name}": ${quantityInBaseUnits} base units requested, ${totalAvailable} available.`,
      );
    }

    resolved.push({
      productId: product.id,
      productName: product.name,
      packagingLevelId: level?.id ?? null,
      packagingLevelUnitName: level?.unitName ?? null,
      unitsPerRequestedQuantity,
      quantityInBaseUnits,
      unitPrice,
      taxRatePercent,
    });
  }

  const total = resolved.reduce((sum, l) => sum + l.unitPrice * l.quantityInBaseUnits, 0);

  let paymentMethod = request.paymentMethod;
  const splitResponses: PaymentSplitResponse[] = [];
  if (request.paymentSplits && request.paymentSplits.length > 0) {
    const splitTotal = request.paymentSplits.reduce((sum, s) => sum + s.amount, 0);
    if (splitTotal !== total) {
      throw new ApiError(400, `Split payment total ${splitTotal} does not match sale total ${total}.`);
    }
    paymentMethod = PaymentMethod.Split;
    for (const split of request.paymentSplits) splitResponses.push({ method: split.method, amount: split.amount });
  }

  let amountTendered: number | null = null;
  let changeDue: number | null = null;
  if (request.amountTendered != null) {
    if (request.amountTendered < 0) throw new ApiError(400, "Amount tendered cannot be negative.");

    const cashOwed =
      request.paymentSplits && request.paymentSplits.length > 0
        ? request.paymentSplits.filter((s) => s.method === PaymentMethod.Cash).reduce((sum, s) => sum + s.amount, 0)
        : request.paymentMethod === PaymentMethod.Cash
          ? total
          : 0;

    if (cashOwed <= 0) throw new ApiError(400, "Amount tendered was provided but this sale has no cash portion.");
    if (request.amountTendered < cashOwed) {
      throw new ApiError(400, `Insufficient amount tendered: ${request.amountTendered} received for ${cashOwed} owed in cash.`);
    }
    amountTendered = request.amountTendered;
    changeDue = request.amountTendered - cashOwed;
  }

  const creditAmount = splitAmountOr(request, PaymentMethod.Credit, total);
  if (creditAmount > 0 && !request.customerId) {
    throw new ApiError(400, "A credit sale requires a customer.");
  }

  let giftCardRow: { id: string; code: string; remainingValue: number; active: boolean } | undefined;
  const giftCardAmount = splitAmountOr(request, PaymentMethod.GiftCard, total);
  let normalizedGiftCardCode: string | null = null;
  if (giftCardAmount > 0) {
    if (!request.giftCardCode?.trim()) throw new ApiError(400, "A gift-card payment requires a card code.");
    normalizedGiftCardCode = request.giftCardCode.trim().toUpperCase();
    giftCardRow = await db.query.giftCards.findFirst({
      where: and(eq(giftCards.companyId, companyId), eq(giftCards.code, normalizedGiftCardCode)),
    });
    if (!giftCardRow) throw new ApiError(404, "Gift card not found.");
    if (!giftCardRow.active) throw new ApiError(400, "This gift card is disabled.");
    if (giftCardRow.remainingValue < giftCardAmount) {
      throw new ApiError(400, `Insufficient gift card balance: ${giftCardRow.remainingValue} available.`);
    }
  }

  const storeCreditAmount = splitAmountOr(request, PaymentMethod.StoreCredit, total);
  let loyaltyRow: { customerId: string; pointsBalance: number; storeCreditBalance: number } | undefined;
  if (storeCreditAmount > 0) {
    if (!request.customerId) throw new ApiError(400, "A store-credit payment requires a customer.");
    loyaltyRow = await db.query.loyaltyAccounts.findFirst({ where: eq(loyaltyAccounts.customerId, request.customerId) });
    if (!loyaltyRow || loyaltyRow.storeCreditBalance < storeCreditAmount) {
      throw new ApiError(400, `Insufficient store credit balance: ${loyaltyRow?.storeCreditBalance ?? 0} available.`);
    }
  }

  // --- Everything validated — now write ---
  const saleId = generateId();
  const timestamp = new Date().toISOString();

  const openShift = await db.query.cashRegisterShifts.findFirst({
    where: and(eq(cashRegisterShifts.locationId, request.locationId), eq(cashRegisterShifts.status, ShiftStatus.Open)),
  });

  const saleLineResponses: SaleLineResponse[] = [];
  for (const line of resolved) {
    const deductions = await deductFefo(line.productId, request.locationId, line.quantityInBaseUnits);
    for (const deduction of deductions) {
      await db.insert(stockMovements).values({
        id: generateId(),
        productId: line.productId,
        batchId: deduction.batchId,
        locationId: request.locationId,
        destinationLocationId: null,
        type: StockMovementType.Sale,
        quantityInBaseUnits: -deduction.quantityInBaseUnits,
        reason: null,
        userId,
        timestamp,
      });

      const batchRow = await db.query.batches.findFirst({ where: eq(batches.id, deduction.batchId) });

      const saleLineId = generateId();
      await db.insert(saleLines).values({
        id: saleLineId,
        saleId,
        productId: line.productId,
        batchId: deduction.batchId,
        quantityInBaseUnits: deduction.quantityInBaseUnits,
        packagingLevelId: line.packagingLevelId,
        unitPrice: line.unitPrice,
        taxRatePercent: line.taxRatePercent,
      });

      saleLineResponses.push({
        productId: line.productId,
        productName: line.productName,
        batchId: deduction.batchId,
        batchNumber: batchRow?.batchNumber ?? null,
        quantityInBaseUnits: deduction.quantityInBaseUnits,
        packagingLevelId: line.packagingLevelId,
        packagingLevelName: line.packagingLevelUnitName,
        unitsPerPackagingLevel: line.unitsPerRequestedQuantity,
        unitPrice: line.unitPrice,
        taxRatePercent: line.taxRatePercent,
        lineTotal: line.unitPrice * deduction.quantityInBaseUnits,
      });
    }
  }

  for (const split of splitResponses) {
    await db.insert(paymentSplits).values({ id: generateId(), saleId, method: split.method, amount: split.amount });
  }

  if (creditAmount > 0 && request.customerId) {
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, request.customerId) });
    if (customer) {
      await db.update(customers).set({ creditBalance: customer.creditBalance + creditAmount }).where(eq(customers.id, request.customerId));
    }
  }

  if (giftCardAmount > 0 && giftCardRow) {
    await db
      .update(giftCards)
      .set({ remainingValue: giftCardRow.remainingValue - giftCardAmount })
      .where(eq(giftCards.id, giftCardRow.id));
  }

  if (storeCreditAmount > 0 && loyaltyRow) {
    await db
      .update(loyaltyAccounts)
      .set({ storeCreditBalance: loyaltyRow.storeCreditBalance - storeCreditAmount })
      .where(eq(loyaltyAccounts.customerId, loyaltyRow.customerId));
  }

  if (company.loyaltyEnabled && request.customerId && total > 0) {
    const pointsEarned = Math.floor(total / company.loyaltyEarnRateAmount);
    if (pointsEarned > 0) {
      const existing = loyaltyRow ?? (await db.query.loyaltyAccounts.findFirst({ where: eq(loyaltyAccounts.customerId, request.customerId) }));
      if (existing) {
        await db
          .update(loyaltyAccounts)
          .set({ pointsBalance: existing.pointsBalance + pointsEarned })
          .where(eq(loyaltyAccounts.customerId, request.customerId));
      } else {
        await db.insert(loyaltyAccounts).values({ customerId: request.customerId, pointsBalance: pointsEarned, storeCreditBalance: 0 });
      }
    }
  }

  await db.insert(sales).values({
    id: saleId,
    companyId,
    locationId: request.locationId,
    userId,
    customerId: request.customerId,
    shiftId: openShift?.id ?? null,
    total,
    paymentMethod,
    status: SaleStatus.Completed,
    amountTendered,
    changeDue,
    giftCardCode: normalizedGiftCardCode,
    timestamp,
    syncStatus: SyncStatus.PendingPush,
  });

  return {
    id: saleId,
    total,
    paymentMethod,
    status: SaleStatus.Completed,
    timestamp,
    productLines: saleLineResponses,
    serviceLines: [],
    paymentSplits: splitResponses,
    amountTendered,
    changeDue,
  };
}

// No stock impact at all, same as the online path — FEFO deduction only
// happens for real once the cart is resumed and actually checked out
// (a call to createSaleInternal above).
async function holdSaleInternal(companyId: string, request: HoldSaleRequest): Promise<SaleResponse> {
  if (request.productLines.length === 0) throw new ApiError(400, "A sale must contain at least one product line.");
  if (request.productLines.some((l) => l.quantity <= 0)) throw new ApiError(400, "Line quantities must be positive.");

  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  if (!company) throw new ApiError(404, "Business not found locally — sync before continuing offline.");

  const locationExists = await db.query.locations.findFirst({
    where: and(eq(locations.id, request.locationId), eq(locations.companyId, companyId)),
  });
  if (!locationExists) throw new ApiError(404, "Location not found.");

  const userId = getAuthStore().getState().user?.id;
  if (!userId) throw new ApiError(401, "Local session not found.");

  const saleId = generateId();
  const timestamp = new Date().toISOString();
  const saleLineResponses: SaleLineResponse[] = [];

  for (const line of request.productLines) {
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, line.productId), eq(products.companyId, companyId), eq(products.isActive, true)),
    });
    if (!product) throw new ApiError(404, `Product ${line.productId} not found.`);

    let level: { id: string; unitName: string; quantityInBaseUnits: number; salePriceOverride: number | null } | undefined;
    if (line.packagingLevelId) {
      level = await db.query.productPackagingLevels.findFirst({
        where: and(eq(productPackagingLevels.id, line.packagingLevelId), eq(productPackagingLevels.productId, product.id)),
      });
      if (!level) throw new ApiError(400, `Packaging level ${line.packagingLevelId} does not belong to product ${product.id}.`);
    }

    const unitsPerRequestedQuantity = level?.quantityInBaseUnits ?? 1;
    const quantityInBaseUnits = line.quantity * unitsPerRequestedQuantity;
    const unitPrice = level
      ? (level.salePriceOverride ?? product.salePrice * level.quantityInBaseUnits) / level.quantityInBaseUnits
      : product.salePrice;
    const taxRatePercent = product.taxRateOverridePercent ?? company.defaultTaxRatePercent;

    await db.insert(saleLines).values({
      id: generateId(),
      saleId,
      productId: product.id,
      batchId: null,
      quantityInBaseUnits,
      packagingLevelId: level?.id ?? null,
      unitPrice,
      taxRatePercent,
    });

    saleLineResponses.push({
      productId: product.id,
      productName: product.name,
      batchId: null,
      batchNumber: null,
      quantityInBaseUnits,
      packagingLevelId: level?.id ?? null,
      packagingLevelName: level?.unitName ?? null,
      unitsPerPackagingLevel: unitsPerRequestedQuantity,
      unitPrice,
      taxRatePercent,
      lineTotal: unitPrice * quantityInBaseUnits,
    });
  }

  const total = saleLineResponses.reduce((sum, l) => sum + l.lineTotal, 0);

  await db.insert(sales).values({
    id: saleId,
    companyId,
    locationId: request.locationId,
    userId,
    customerId: request.customerId,
    shiftId: null,
    total,
    paymentMethod: PaymentMethod.Cash,
    status: SaleStatus.Held,
    amountTendered: null,
    changeDue: null,
    giftCardCode: null,
    timestamp,
    syncStatus: SyncStatus.PendingPush,
  });

  return {
    id: saleId,
    total,
    paymentMethod: PaymentMethod.Cash,
    status: SaleStatus.Held,
    timestamp,
    productLines: saleLineResponses,
    serviceLines: [],
    paymentSplits: [],
    amountTendered: null,
    changeDue: null,
  };
}

async function deleteHeldSaleInternal(companyId: string, saleId: string): Promise<void> {
  const sale = await db.query.sales.findFirst({ where: and(eq(sales.id, saleId), eq(sales.companyId, companyId)) });
  if (!sale) throw new ApiError(404, "Sale not found.");
  if (sale.status !== SaleStatus.Held) throw new ApiError(400, "Only a held sale can be deleted.");

  await db.delete(saleLines).where(eq(saleLines.saleId, saleId));
  await db.delete(sales).where(eq(sales.id, saleId));
}

/** Local-first replacement for the online sale-creation/hold endpoints —
 * TS port of the MAUI client's LocalSalesService. Every Sale/SaleLine/
 * StockMovement created here keeps the same client-generated ids sync push
 * later sends to the server, and is marked SyncStatus.PendingPush until
 * then. Write methods run inside localDbWriteLock so a checkout can never
 * race a sync-pull apply on the same batch. */
export const localSalesService = {
  createSale: (companyId: string, request: CreateSaleRequest) =>
    localDbWriteLock.run(() => createSaleInternal(companyId, request)),

  holdSale: (companyId: string, request: HoldSaleRequest) => localDbWriteLock.run(() => holdSaleInternal(companyId, request)),

  deleteHeldSale: (companyId: string, saleId: string) => localDbWriteLock.run(() => deleteHeldSaleInternal(companyId, saleId)),

  async getHeldSales(companyId: string, locationId: string | null): Promise<HeldSaleSummaryResponse[]> {
    const rows = await db.query.sales.findMany({
      where: locationId
        ? and(eq(sales.companyId, companyId), eq(sales.status, SaleStatus.Held), eq(sales.locationId, locationId))
        : and(eq(sales.companyId, companyId), eq(sales.status, SaleStatus.Held)),
      orderBy: [desc(sales.timestamp)],
    });

    const results: HeldSaleSummaryResponse[] = [];
    for (const sale of rows) {
      const user = await db.query.users.findFirst({ where: eq(users.id, sale.userId) });
      const location = await db.query.locations.findFirst({ where: eq(locations.id, sale.locationId) });
      const lineCount = await db.query.saleLines.findMany({ where: eq(saleLines.saleId, sale.id) });
      results.push({
        id: sale.id,
        timestamp: sale.timestamp,
        total: sale.total,
        cashierName: user?.name ?? "—",
        locationName: location?.name ?? "—",
        itemCount: lineCount.length,
      });
    }
    return results;
  },

  async getSaleDetail(companyId: string, saleId: string): Promise<SaleDetailResponse> {
    const sale = await db.query.sales.findFirst({ where: and(eq(sales.id, saleId), eq(sales.companyId, companyId)) });
    if (!sale) throw new ApiError(404, "Sale not found.");

    const user = await db.query.users.findFirst({ where: eq(users.id, sale.userId) });
    const location = await db.query.locations.findFirst({ where: eq(locations.id, sale.locationId) });
    const lines = await db.query.saleLines.findMany({ where: eq(saleLines.saleId, saleId) });
    const splits = await db.query.paymentSplits.findMany({ where: eq(paymentSplits.saleId, saleId) });

    const productLines: SaleLineResponse[] = [];
    for (const line of lines) {
      const product = await db.query.products.findFirst({ where: eq(products.id, line.productId) });
      const batch = line.batchId ? await db.query.batches.findFirst({ where: eq(batches.id, line.batchId) }) : undefined;
      const level = line.packagingLevelId
        ? await db.query.productPackagingLevels.findFirst({ where: eq(productPackagingLevels.id, line.packagingLevelId) })
        : undefined;

      productLines.push({
        productId: line.productId,
        productName: product?.name ?? "—",
        batchId: line.batchId,
        batchNumber: batch?.batchNumber ?? null,
        quantityInBaseUnits: line.quantityInBaseUnits,
        packagingLevelId: line.packagingLevelId,
        packagingLevelName: level?.unitName ?? null,
        unitsPerPackagingLevel: level?.quantityInBaseUnits ?? 1,
        unitPrice: line.unitPrice,
        taxRatePercent: line.taxRatePercent,
        lineTotal: line.unitPrice * line.quantityInBaseUnits,
      });
    }

    return {
      id: sale.id,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      timestamp: sale.timestamp,
      cashierName: user?.name ?? "—",
      locationName: location?.name ?? "—",
      productLines,
      serviceLines: [],
      paymentSplits: splits.map((s) => ({ method: s.method, amount: s.amount })),
      amountTendered: sale.amountTendered,
      changeDue: sale.changeDue,
    };
  },
};
