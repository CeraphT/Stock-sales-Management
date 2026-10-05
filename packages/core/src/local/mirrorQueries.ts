import { and, asc, eq, like, or } from "drizzle-orm";

import { ApiError } from "../api/client";
import type { BatchResponse, CategoryResponse, CompanyBatchItem, ProductDetailResponse, SupplierResponse } from "../api/types/catalog";
import type { CustomerResponse, GiftCardResponse } from "../api/types/customers";
import { db } from "../db/client";
import {
  batches,
  categories,
  customers,
  giftCards,
  loyaltyAccounts,
  productPackagingLevels,
  products,
  suppliers,
} from "../db/schema";

/**
 * Offline reads of the sync-pulled mirror for the management screens
 * (Categories, Customers, Suppliers, Gift Cards, Product detail, checkout's
 * selected customer). Each returns exactly the shape of the matching online
 * endpoint, so a screen can show these instantly and swap in the server
 * answer when (if) it arrives — see apps/mobile useLocalFirst.
 *
 * The mirror is as fresh as the last sync pull; fields the pull doesn't carry
 * get neutral defaults (noted inline) and are replaced by the online answer.
 */

const contains = (value: string) => `%${value.trim()}%`;

export const localMirrorQueries = {
  async listCategories(companyId: string): Promise<CategoryResponse[]> {
    const rows = await db.query.categories.findMany({
      where: eq(categories.companyId, companyId),
      orderBy: [asc(categories.name)],
    });
    return rows.map((c) => ({ id: c.id, name: c.name }));
  },

  async listSuppliers(companyId: string, search?: string): Promise<SupplierResponse[]> {
    const rows = await db.query.suppliers.findMany({
      where: search?.trim()
        ? and(eq(suppliers.companyId, companyId), or(like(suppliers.name, contains(search)), like(suppliers.contactPhone, contains(search))))
        : eq(suppliers.companyId, companyId),
      orderBy: [asc(suppliers.name)],
    });
    return rows.map((s) => ({ id: s.id, name: s.name, contactPhone: s.contactPhone, contactEmail: s.contactEmail }));
  },

  async listCustomers(companyId: string, search?: string): Promise<CustomerResponse[]> {
    const rows = await db.query.customers.findMany({
      where: search?.trim()
        ? and(eq(customers.companyId, companyId), or(like(customers.name, contains(search)), like(customers.phone, contains(search))))
        : eq(customers.companyId, companyId),
      orderBy: [asc(customers.name)],
    });
    const out: CustomerResponse[] = [];
    for (const c of rows) out.push(await toCustomerResponse(c));
    return out;
  },

  async getCustomer(companyId: string, customerId: string): Promise<CustomerResponse | null> {
    const c = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)) });
    return c ? toCustomerResponse(c) : null;
  },

  async listGiftCards(companyId: string, search?: string): Promise<GiftCardResponse[]> {
    const rows = await db.query.giftCards.findMany({
      where: search?.trim()
        ? and(eq(giftCards.companyId, companyId), like(giftCards.code, contains(search.toUpperCase())))
        : eq(giftCards.companyId, companyId),
    });
    return rows
      .map((g) => ({
        id: g.id,
        code: g.code,
        initialValue: g.initialValue,
        remainingValue: g.remainingValue,
        active: g.active,
        // Rows pulled before created_at was mirrored have none — sort them last.
        createdAt: g.createdAt ?? "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getProductDetail(companyId: string, productId: string): Promise<ProductDetailResponse> {
    const p = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.companyId, companyId)) });
    if (!p) throw new ApiError(404, "Product not found locally — sync before continuing offline.");
    const category = p.categoryId ? await db.query.categories.findFirst({ where: eq(categories.id, p.categoryId) }) : undefined;
    const supplier = p.supplierId ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, p.supplierId) }) : undefined;
    const levels = await db.query.productPackagingLevels.findMany({
      where: eq(productPackagingLevels.productId, productId),
      orderBy: [asc(productPackagingLevels.quantityInBaseUnits)],
    });
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryId: p.categoryId,
      categoryName: category?.name ?? null,
      supplierId: p.supplierId,
      supplierName: supplier?.name ?? null,
      purchasePrice: p.purchasePrice,
      salePrice: p.salePrice,
      isFavorite: p.isFavorite,
      isActive: p.isActive,
      lowStockThreshold: p.lowStockThreshold,
      taxRateOverridePercent: p.taxRateOverridePercent,
      packagingLevels: levels.map((l) => ({
        id: l.id,
        unitName: l.unitName,
        quantityInBaseUnits: l.quantityInBaseUnits,
        salePriceOverride: l.salePriceOverride,
      })),
      sellByMeasure: p.sellByMeasure,
      measureUnit: p.measureUnit,
      unitsPerMeasure: p.unitsPerMeasure,
      serialTracked: p.serialTracked,
      hasVariants: p.hasVariants,
      // Not in the sync pull — neutral defaults until the online answer lands.
      variantName: null,
      parentProductId: null,
      isAssembly: false,
      manufacturer: null,
    };
  },

  /** Stock-count list: batches still holding stock, active products, optionally
   * one location — same rule and order as GET /stock/batches. */
  async listCompanyBatches(companyId: string, locationId?: string): Promise<CompanyBatchItem[]> {
    const activeProducts = await db.query.products.findMany({ where: and(eq(products.companyId, companyId), eq(products.isActive, true)) });
    const nameById = new Map(activeProducts.map((p) => [p.id, p.name]));
    const rows = await db.query.batches.findMany();
    return rows
      .filter((b) => nameById.has(b.productId) && b.quantityInBaseUnits > 0 && (!locationId || b.locationId === locationId))
      .map((b) => ({
        batchId: b.id,
        productId: b.productId,
        productName: nameById.get(b.productId)!,
        batchNumber: b.batchNumber,
        locationId: b.locationId,
        quantityInBaseUnits: b.quantityInBaseUnits,
        expiryDate: b.expiryDate,
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName) || (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  },

  async listProductBatches(companyId: string, productId: string): Promise<BatchResponse[]> {
    const product = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.companyId, companyId)) });
    if (!product) return [];
    const rows = await db.query.batches.findMany({ where: eq(batches.productId, productId) });
    return rows
      .map((b) => ({
        id: b.id,
        locationId: b.locationId,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantityInBaseUnits: b.quantityInBaseUnits,
        purchasePricePerBaseUnit: b.purchasePricePerBaseUnit,
        // The mirror keeps the last change time, not the receipt time — closest
        // available stand-in until the online answer replaces it.
        receivedAt: b.updatedAt,
      }))
      .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  },
};

async function toCustomerResponse(c: typeof customers.$inferSelect): Promise<CustomerResponse> {
  const loyalty = await db.query.loyaltyAccounts.findFirst({ where: eq(loyaltyAccounts.customerId, c.id) });
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    creditBalance: c.creditBalance,
    loyaltyPointsBalance: loyalty?.pointsBalance ?? 0,
    loyaltyStoreCreditBalance: loyalty?.storeCreditBalance ?? 0,
    // Reward milestones aren't mirrored — 0 until the online answer lands.
    rewardsGranted: 0,
    isBusiness: c.isBusiness ?? false,
    taxId: c.taxId ?? null,
  };
}
