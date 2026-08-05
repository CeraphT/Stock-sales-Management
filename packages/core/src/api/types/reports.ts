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
  totalTax: number;
  dailyBreakdown: DailySalesItem[];
}

export interface TaxDeclarationResponse {
  from: string | null;
  to: string | null;
  standardRatePercent: number;
  salesTtc: number;
  salesHt: number;
  vatCollected: number;
  purchasesTtc: number;
  purchasesHt: number;
  vatDeductible: number;
  vatDue: number;
  salesCount: number;
}

export interface SalesJournalItem {
  id: string;
  timestamp: string;
  customerName: string | null;
  paymentMethod: number;
  ht: number;
  vat: number;
  ttc: number;
}

export interface PurchasesJournalItem {
  id: string;
  timestamp: string;
  productName: string;
  batchNumber: string;
  supplierName: string | null;
  ht: number;
  vat: number;
  ttc: number;
}

export interface CashBookItem {
  id: string;
  openedAt: string;
  closedAt: string | null;
  cashierName: string;
  openingCash: number;
  cashSales: number;
  expectedCash: number | null;
  closingCash: number | null;
  discrepancy: number | null;
}

export interface TopProductItem {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}
