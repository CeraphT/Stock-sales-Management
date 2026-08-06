import { and, eq, like, or } from "drizzle-orm";

import { ApiError } from "../api/client";
import type { CompanyResponse, LocationResponse } from "../api/types/auth";
import type { PackagingLevelInfo, ProductSearchResult, StockAvailabilityResponse } from "../api/types/catalog";
import type { CustomerResponse } from "../api/types/customers";
import type { StockStatus } from "../api/enums";
import { db } from "../db/client";
import { batches, companies, customers, loyaltyAccounts, locations, productPackagingLevels, products } from "../db/schema";

const MAX_SEARCH_RESULTS = 20;

/** POS read path against the local, sync-pulled catalog cache instead of
 * the network, so barcode scan/search/checkout keep working with zero
 * connectivity. TS port of the MAUI client's LocalCatalogQueryService. */
export const localCatalogQueryService = {
  async getLocations(companyId: string): Promise<LocationResponse[]> {
    const rows = await db.query.locations.findMany({ where: eq(locations.companyId, companyId) });
    return rows.map((l) => ({ id: l.id, name: l.name, address: l.address, active: l.active }));
  },

  async getCompany(companyId: string): Promise<CompanyResponse> {
    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    if (!company) {
      throw new ApiError(404, "Business not found locally — sync before continuing offline.");
    }
    return {
      id: company.id,
      name: company.name,
      uniqueCode: company.uniqueCode,
      currency: company.currency,
      // Not part of the sync-pull payload (server doesn't send them) — safe
      // defaults; the services module isn't in scope yet, and description
      // is cosmetic-only.
      servicesModuleEnabled: false,
      description: null,
      defaultTaxRatePercent: company.defaultTaxRatePercent,
      loyaltyEnabled: company.loyaltyEnabled,
      loyaltyEarnRateAmount: company.loyaltyEarnRateAmount,
      loyaltyPointValue: company.loyaltyPointValue,
      // Reward program is checked online via rewardsApi, not from this offline
      // mirror — safe defaults keep the type satisfied.
      rewardProgramEnabled: false,
      rewardPurchaseCount: 10,
      rewardGiftCardValue: 0,
      // Profile fields aren't in the sync-pull payload; safe defaults. Receipts
      // that need them fetch the company from the API when online.
      address: null,
      phone: null,
      receiptFooter: null,
      logoUrl: null,
      defaultLowStockThreshold: 0,
      setupCompleted: true,
      taxRegime: 0,
      flatTaxAmount: 0,
      flatTaxPeriod: 1,
      taxId: null,
      // Capabilities aren't in the sync-pull payload yet — default to historical
      // behaviour (expiry on). Online reads (companiesApi.get) get the real values.
      capabilities: {
        expiryTracking: true,
        sellByMeasure: false,
        serialTracking: false,
        variants: false,
        assembly: false,
      },
    };
  },

  async searchCustomers(companyId: string, search: string): Promise<CustomerResponse[]> {
    const pattern = `%${search}%`;
    const rows = await db.query.customers.findMany({
      where: search.trim()
        ? and(eq(customers.companyId, companyId), or(like(customers.name, pattern), like(customers.phone, pattern)))
        : eq(customers.companyId, companyId),
      orderBy: (c, { asc }) => asc(c.name),
      limit: MAX_SEARCH_RESULTS,
    });

    const results: CustomerResponse[] = [];
    for (const customer of rows) {
      const loyalty = await db.query.loyaltyAccounts.findFirst({ where: eq(loyaltyAccounts.customerId, customer.id) });
      results.push({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        creditBalance: customer.creditBalance,
        loyaltyPointsBalance: loyalty?.pointsBalance ?? 0,
        loyaltyStoreCreditBalance: loyalty?.storeCreditBalance ?? 0,
        rewardsGranted: 0,
        isBusiness: false,
        taxId: customer.taxId ?? null,
      });
    }
    return results;
  },

  async searchProducts(companyId: string, search: string): Promise<ProductSearchResult[]> {
    if (!search.trim()) return [];

    const pattern = `%${search}%`;
    const rows = await db.query.products.findMany({
      // Variant-parent headers (hasVariants) hold no stock and are never sold
      // directly — only their variant rows are — so they're excluded here, same
      // as the online search endpoint.
      where: and(
        eq(products.companyId, companyId),
        eq(products.isActive, true),
        eq(products.hasVariants, false),
        or(like(products.name, pattern), like(products.barcode, pattern)),
      ),
      orderBy: (p, { asc }) => asc(p.name),
      limit: MAX_SEARCH_RESULTS,
    });

    const results: ProductSearchResult[] = [];
    for (const product of rows) {
      const totalBaseUnits = await sumBatchQuantity(product.id);
      const levels = await packagingLevelInfos(product.id, product.salePrice);
      const productBatches = await db.query.batches.findMany({ where: eq(batches.productId, product.id) });
      const earliestExpiry =
        productBatches
          .filter((b) => b.expiryDate !== null && b.quantityInBaseUnits > 0)
          .map((b) => b.expiryDate as string)
          .sort((a, b) => a.localeCompare(b))[0] ?? null;
      results.push({
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        salePrice: product.salePrice,
        stockStatus: computeStockStatus(totalBaseUnits, product.lowStockThreshold),
        packagingLevels: levels,
        earliestExpiry,
        sellByMeasure: product.sellByMeasure,
        measureUnit: product.measureUnit,
        unitsPerMeasure: product.unitsPerMeasure,
        serialTracked: product.serialTracked,
      });
    }
    return results;
  },

  // Manual lookup box — accepts either an exact barcode or a partial
  // product name, matching Section 17's "Stock Availability Check" spec
  // (one box, either identifier).
  async getProductAvailability(companyId: string, query: string): Promise<StockAvailabilityResponse> {
    const product = await db.query.products.findFirst({
      where: and(eq(products.companyId, companyId), eq(products.isActive, true), or(eq(products.barcode, query), like(products.name, `%${query}%`))),
    });
    if (!product) {
      throw new ApiError(404, "No matching product.");
    }
    return toAvailabilityResponse(product);
  },

  // Scanner lookup — a scanned code is always complete and exact, so this
  // deliberately skips the name-substring fallback `getProductAvailability`
  // uses for manual typing. Falling back to a fuzzy name match here risked
  // matching the wrong product on a barcode that doesn't exist locally.
  async findByBarcode(companyId: string, barcode: string): Promise<StockAvailabilityResponse> {
    const product = await db.query.products.findFirst({
      where: and(eq(products.companyId, companyId), eq(products.isActive, true), eq(products.barcode, barcode)),
    });
    if (!product) {
      throw new ApiError(404, "No product with this barcode.");
    }
    return toAvailabilityResponse(product);
  },

  // Total stock across all batches at every location this device has
  // synced — used to warn before checkout (e.g. resuming a held sale)
  // rather than only discovering a shortfall when FEFO deduction fails.
  getAvailableStock(productId: string): Promise<number> {
    return sumBatchQuantity(productId);
  },
};

async function toAvailabilityResponse(product: {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  lowStockThreshold: number;
}): Promise<StockAvailabilityResponse> {
  const productBatches = await db.query.batches.findMany({ where: eq(batches.productId, product.id) });
  const totalBaseUnits = productBatches.reduce((sum, b) => sum + b.quantityInBaseUnits, 0);
  const earliestExpiry =
    productBatches
      .filter((b) => b.expiryDate !== null && b.quantityInBaseUnits > 0)
      .sort((a, b) => (a.expiryDate as string).localeCompare(b.expiryDate as string))[0]?.expiryDate ?? null;

  const levelRows = await db.query.productPackagingLevels.findMany({
    where: eq(productPackagingLevels.productId, product.id),
  });
  const levelsLargestFirst = [...levelRows].sort((a, b) => b.quantityInBaseUnits - a.quantityInBaseUnits);

  return {
    productId: product.id,
    name: product.name,
    barcode: product.barcode,
    salePrice: product.salePrice,
    totalBaseUnitsAvailable: totalBaseUnits,
    displayQuantity: formatDisplayQuantity(totalBaseUnits, levelsLargestFirst),
    stockStatus: computeStockStatus(totalBaseUnits, product.lowStockThreshold),
    earliestExpiry,
    packagingLevels: await packagingLevelInfos(product.id, product.salePrice),
  };
}

async function sumBatchQuantity(productId: string): Promise<number> {
  const rows = await db.query.batches.findMany({ where: eq(batches.productId, productId) });
  return rows.reduce((sum, b) => sum + b.quantityInBaseUnits, 0);
}

async function packagingLevelInfos(productId: string, productSalePrice: number): Promise<PackagingLevelInfo[]> {
  const rows = await db.query.productPackagingLevels.findMany({ where: eq(productPackagingLevels.productId, productId) });
  return rows.map((l) => ({
    id: l.id,
    unitName: l.unitName,
    quantityInBaseUnits: l.quantityInBaseUnits,
    unitPrice: l.salePriceOverride ?? productSalePrice * l.quantityInBaseUnits,
  }));
}

function computeStockStatus(totalBaseUnits: number, lowStockThreshold: number): StockStatus {
  if (totalBaseUnits <= 0) return "out_of_stock";
  if (totalBaseUnits <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

function formatDisplayQuantity(totalBaseUnits: number, levelsLargestFirst: { unitName: string; quantityInBaseUnits: number }[]): string {
  if (totalBaseUnits <= 0) return "0";

  let remaining = totalBaseUnits;
  const parts: string[] = [];

  for (const level of levelsLargestFirst) {
    if (level.quantityInBaseUnits <= 0) continue;
    const count = Math.floor(remaining / level.quantityInBaseUnits);
    if (count > 0) {
      parts.push(`${count} ${pluralize(level.unitName, count)}`);
      remaining -= count * level.quantityInBaseUnits;
    }
  }

  if (remaining > 0) parts.push(`${remaining} ${pluralize("loose unit", remaining)}`);

  return parts.length > 0 ? parts.join(" + ") : `${totalBaseUnits}`;
}

function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  const lower = word.toLowerCase();
  return lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("sh") || lower.endsWith("ch") ? `${word}es` : `${word}s`;
}
