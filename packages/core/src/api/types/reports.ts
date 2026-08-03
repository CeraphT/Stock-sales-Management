import type { PaymentMethod } from "../enums";

export interface RecentSaleLineItem {
  name: string;
  quantity: number;
  unitLabel: string;
}

export interface RecentSaleItem {
  id: string;
  total: number;
  paymentMethod: PaymentMethod;
  timestamp: string;
  items: RecentSaleLineItem[];
}

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
}

export interface DashboardSummaryResponse {
  todayRevenue: number;
  todaySalesCount: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  archivedProductsCount: number;
  recentSales: RecentSaleItem[];
  negativeStockBatchCount: number;
  autoClosedShiftConflictCount: number;
  revenueTrend: DailyRevenuePoint[];
}

export interface DailySalesItem {
  date: string;
  revenue: number;
  salesCount: number;
}

export interface SalesSummaryResponse {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
  averageSaleValue: number;
  dailyBreakdown: DailySalesItem[];
}

export interface TopProductItem {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}
