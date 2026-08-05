import type { StockStatus } from '@stockflow/core/api/enums';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { batches, categories, products, suppliers } from '@/lib/db/schema';

export interface InventoryRow {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string;
  supplierId: string | null;
  supplierName: string;
  stock: number;
  status: StockStatus;
  earliestExpiry: string | null;
  costValue: number;
  retailValue: number;
}

function statusOf(stock: number, lowStockThreshold: number): StockStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

/** Per-product stock valuation for the inventory report — active products only,
 * from the local sync-pulled cache (company-scoped). RN port of desktop's
 * data/inventory.ts (identical logic on the shared core schema). */
export async function listInventory(companyId: string): Promise<InventoryRow[]> {
  const [prods, cats, sups] = await Promise.all([
    db.query.products.findMany({
      where: and(eq(products.companyId, companyId), eq(products.isActive, true)),
      orderBy: (p, { asc }) => asc(p.name),
    }),
    db.query.categories.findMany({ where: eq(categories.companyId, companyId) }),
    db.query.suppliers.findMany({ where: eq(suppliers.companyId, companyId) }),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const supName = new Map(sups.map((s) => [s.id, s.name]));

  const rows: InventoryRow[] = [];
  for (const p of prods) {
    const bs = await db.query.batches.findMany({ where: eq(batches.productId, p.id) });
    const stock = bs.reduce((s, b) => s + b.quantityInBaseUnits, 0);
    const costValue = bs.reduce((s, b) => s + b.quantityInBaseUnits * b.purchasePricePerBaseUnit, 0);
    const expiries = bs.filter((b) => b.expiryDate && b.quantityInBaseUnits > 0).map((b) => b.expiryDate as string);
    rows.push({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryId: p.categoryId,
      categoryName: p.categoryId ? (catName.get(p.categoryId) ?? '—') : 'Uncategorized',
      supplierId: p.supplierId,
      supplierName: p.supplierId ? (supName.get(p.supplierId) ?? '—') : '—',
      stock,
      status: statusOf(stock, p.lowStockThreshold),
      earliestExpiry: expiries.length ? expiries.sort()[0] : null,
      costValue,
      retailValue: stock * p.salePrice,
    });
  }
  return rows;
}
