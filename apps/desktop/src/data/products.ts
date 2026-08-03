import { db } from "@stockflow/core/db/client";
import type { StockStatus } from "@stockflow/core/api/enums";
import { batches, products } from "@stockflow/core/db/schema";
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
}

function statusOf(stock: number, lowStockThreshold: number): StockStatus {
  if (stock <= 0) return "out_of_stock";
  if (stock <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

/** All active products for a company with their summed stock + status, read
 * from the local sync-pulled cache. TanStack Query calls this; it's
 * re-invalidated after every syncNow() (see runSync). */
export async function listProducts(companyId: string): Promise<ProductRow[]> {
  const rows = await db.query.products.findMany({
    where: and(eq(products.companyId, companyId), eq(products.isActive, true)),
    orderBy: (p, { asc }) => asc(p.name),
  });

  const result: ProductRow[] = [];
  for (const p of rows) {
    const bs = await db.query.batches.findMany({ where: eq(batches.productId, p.id) });
    const stock = bs.reduce((s, b) => s + b.quantityInBaseUnits, 0);
    result.push({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      salePrice: p.salePrice,
      categoryId: p.categoryId,
      isFavorite: p.isFavorite,
      stock,
      status: statusOf(stock, p.lowStockThreshold),
    });
  }
  return result;
}
