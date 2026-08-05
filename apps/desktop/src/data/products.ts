import { db } from "@stockflow/core/db/client";
import type { StockStatus } from "@stockflow/core/api/enums";
import { batches, productPackagingLevels, products } from "@stockflow/core/db/schema";
import { and, eq } from "drizzle-orm";

export interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  categoryId: string | null;
  isFavorite: boolean;
  stock: number;
  status: StockStatus;
  /** Soonest expiry among in-stock batches (ISO), or null. */
  earliestExpiry: string | null;
  /** Names of this product's packaging/sub-units (e.g. ["Box","Blister"]). */
  packagingUnits: string[];
}

/** Days from today until an ISO date (negative = already past). */
export function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  return Math.round((d - Date.now()) / 86_400_000);
}

function statusOf(stock: number, lowStockThreshold: number): StockStatus {
  if (stock <= 0) return "out_of_stock";
  if (stock <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

/** All active products for a company with their summed stock + status, read
 * from the local sync-pulled cache. TanStack Query calls this; it's
 * re-invalidated after every syncNow() (see runSync). */
export async function listProducts(companyId: string, active = true): Promise<ProductRow[]> {
  const rows = await db.query.products.findMany({
    where: and(eq(products.companyId, companyId), eq(products.isActive, active)),
    orderBy: (p, { asc }) => asc(p.name),
  });

  const result: ProductRow[] = [];
  for (const p of rows) {
    const bs = await db.query.batches.findMany({ where: eq(batches.productId, p.id) });
    const stock = bs.reduce((s, b) => s + b.quantityInBaseUnits, 0);
    const expiries = bs.filter((b) => b.expiryDate && b.quantityInBaseUnits > 0).map((b) => b.expiryDate as string);
    const levels = await db.query.productPackagingLevels.findMany({ where: eq(productPackagingLevels.productId, p.id) });
    result.push({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      salePrice: p.salePrice,
      categoryId: p.categoryId,
      isFavorite: p.isFavorite,
      stock,
      status: statusOf(stock, p.lowStockThreshold),
      earliestExpiry: expiries.length ? expiries.sort()[0] : null,
      packagingUnits: levels.map((l) => l.unitName),
    });
  }
  return result;
}
