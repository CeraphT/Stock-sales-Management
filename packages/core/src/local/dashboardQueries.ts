import { and, eq, gte } from "drizzle-orm";

import { SaleStatus } from "../api/enums";
import { db } from "../db/client";
import { batches, products, sales } from "../db/schema";

export interface DailyRevenuePoint {
  date: string;
  total: number;
}

export interface StockHealth {
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface DashboardStats {
  todaySalesTotal: number;
  todaySalesCount: number;
  lowStockCount: number;
  heldSalesCount: number;
  revenueTrend: DailyRevenuePoint[];
  stockHealth: StockHealth;
}

export async function getDashboardStats(companyId: string, locationId: string): Promise<DashboardStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const sevenDaysAgoStart = new Date(todayStart);
  sevenDaysAgoStart.setDate(sevenDaysAgoStart.getDate() - 6);

  const recentSales = await db.query.sales.findMany({
    where: and(
      eq(sales.companyId, companyId),
      eq(sales.locationId, locationId),
      eq(sales.status, SaleStatus.Completed),
      gte(sales.timestamp, sevenDaysAgoStart.toISOString()),
    ),
  });

  const todaySales = recentSales.filter((s) => s.timestamp >= todayStartIso);

  // Zero-filled 7-day trend (today back to 6 days ago), grouped by UTC
  // calendar date — matches the MAUI client's server-side DailyRevenuePoint
  // gap-filling, just computed locally instead of over the network.
  const totalsByDate = new Map<string, number>();
  for (const sale of recentSales) {
    const day = sale.timestamp.slice(0, 10);
    totalsByDate.set(day, (totalsByDate.get(day) ?? 0) + sale.total);
  }
  const revenueTrend: DailyRevenuePoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    revenueTrend.push({ date: key, total: totalsByDate.get(key) ?? 0 });
  }

  const activeProducts = await db.query.products.findMany({
    where: and(eq(products.companyId, companyId), eq(products.isActive, true)),
  });
  const locationBatches = await db.query.batches.findMany({ where: eq(batches.locationId, locationId) });
  const stockByProduct = new Map<string, number>();
  for (const batch of locationBatches) {
    stockByProduct.set(batch.productId, (stockByProduct.get(batch.productId) ?? 0) + batch.quantityInBaseUnits);
  }

  const stockHealth: StockHealth = { inStock: 0, lowStock: 0, outOfStock: 0 };
  for (const product of activeProducts) {
    const stock = stockByProduct.get(product.id) ?? 0;
    if (stock <= 0) stockHealth.outOfStock++;
    else if (stock <= product.lowStockThreshold) stockHealth.lowStock++;
    else stockHealth.inStock++;
  }
  const lowStockCount = stockHealth.lowStock + stockHealth.outOfStock;

  const heldSales = await db.query.sales.findMany({
    where: and(eq(sales.companyId, companyId), eq(sales.locationId, locationId), eq(sales.status, SaleStatus.Held)),
  });

  return {
    todaySalesTotal: todaySales.reduce((sum, s) => sum + s.total, 0),
    todaySalesCount: todaySales.length,
    lowStockCount,
    heldSalesCount: heldSales.length,
    revenueTrend,
    stockHealth,
  };
}
