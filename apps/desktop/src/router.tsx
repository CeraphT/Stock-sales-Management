import { createHashRouter, Navigate } from "react-router-dom";

import { RootErrorFallback, ScreenErrorFallback } from "@/components/Errors";
import { UserRole } from "@stockflow/core/api/enums";

import { useDbReady } from "@/lib/db/ready";
import { useImpersonation } from "@/lib/impersonation";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { useAuthStore } from "@/lib/stores";

function FullScreenMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background text-center">
      <div className="text-lg font-bold text-text-primary">{title}</div>
      {body ? <div className="mt-1 max-w-sm text-sm text-text-secondary">{body}</div> : null}
    </div>
  );
}
import { Archived } from "@/screens/Archived";
import { CompanyPicker } from "@/screens/CompanyPicker";
import { BulkStockRegister } from "@/screens/BulkStockRegister";
import { CashRegister } from "@/screens/CashRegister";
import { Categories } from "@/screens/Categories";
import { CompanySettings } from "@/screens/CompanySettings";
import { CustomerCredits } from "@/screens/CustomerCredits";
import { Customers } from "@/screens/Customers";
import { DataMaintenance } from "@/screens/DataMaintenance";
import { Dashboard } from "@/screens/Dashboard";
import { GiftCards } from "@/screens/GiftCards";
import { HeldSales } from "@/screens/HeldSales";
import { InventoryReport } from "@/screens/InventoryReport";
import { PrinterSettings } from "@/screens/PrinterSettings";
import { Reconciliation } from "@/screens/Reconciliation";
import { Reports } from "@/screens/Reports";
import { Staff } from "@/screens/Staff";
import { Support } from "@/screens/Support";
import { TaxDeclaration } from "@/screens/TaxDeclaration";
import { Placeholder } from "@/screens/Placeholder";
import { Pos } from "@/screens/Pos";
import { ProductForm } from "@/screens/ProductForm";
import { PurchaseOrderDetail } from "@/screens/PurchaseOrderDetail";
import { PurchaseOrderForm } from "@/screens/PurchaseOrderForm";
import { PurchaseOrders } from "@/screens/PurchaseOrders";
import { ReceiveStockPicker } from "@/screens/ReceiveStockPicker";
import { ProductInventory } from "@/screens/ProductInventory";
import { Products } from "@/screens/Products";
import { SaleDetail } from "@/screens/SaleDetail";
import { StockAdjust } from "@/screens/StockAdjust";
import { StockReceive } from "@/screens/StockReceive";
import { StockSupplierReturn } from "@/screens/StockSupplierReturn";
import { StockCount } from "@/screens/StockCount";
import { PrintLabels } from "@/screens/PrintLabels";
import { Alerts } from "@/screens/Alerts";
import { DemandForecast } from "@/screens/DemandForecast";
import { DeadStock } from "@/screens/DeadStock";
import { Suppliers } from "@/screens/Suppliers";
import { SalesHistory } from "@/screens/SalesHistory";
import { Shell } from "@/screens/Shell";
import { Login } from "@/screens/auth/Login";
import { MyShops } from "@/screens/MyShops";

function RootRedirect() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  const companyId = useAuthStore((s) => s.companyId);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/login" replace />;
  // A SuperAdmin has no company of their own: they pick one first.
  if (role === UserRole.SuperAdmin && !impersonating) return <Navigate to="/companies" replace />;
  // Signed in but no shop open: pick, create or join one. (A shop left open
  // reopens straight away, even offline: the session is kept on the device.)
  if (!companyId) return <Navigate to="/shops" replace />;
  return <Navigate to="/dashboard" replace />;
}

/** SuperAdmin company picker. Only for a SuperAdmin who isn't already inside a
 * company — everyone else belongs in the scoped app. */
function CompanyPickerGuard() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/login" replace />;
  if (role !== UserRole.SuperAdmin || impersonating) return <Navigate to="/" replace />;
  return <CompanyPicker />;
}

/** "My shops": a signed-in account (not a SuperAdmin) choosing its business. */
function ShopsGuard() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  const dbReady = useDbReady((s) => s.ready);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/login" replace />;
  if (role === UserRole.SuperAdmin) return <Navigate to={impersonating ? "/dashboard" : "/companies"} replace />;
  // Opening a shop checks the local database for unsent work first.
  if (!dbReady) return <FullScreenMessage title="Preparing local database…" />;
  return <MyShops />;
}

/** Layout route for the authenticated app — renders the Shell (which hosts the
 * child <Outlet/>) only when a session exists, else bounces to onboarding. */
function AuthGuard() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  const dbReady = useDbReady((s) => s.ready);
  const dbError = useDbReady((s) => s.error);
  const companyId = useAuthStore((s) => s.companyId);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/login" replace />;
  // A SuperAdmin outside any company has no data to show here — pick one first.
  if (role === UserRole.SuperAdmin && !impersonating) return <Navigate to="/companies" replace />;
  if (!companyId) return <Navigate to="/shops" replace />;
  if (dbError) return <FullScreenMessage title="Local database error" body={dbError} />;
  if (!dbReady) return <FullScreenMessage title="Preparing local database…" />;
  return <Shell />;
}

export const router = createHashRouter([
  {
    // Top-level catch: a crash on a public route or outside the shell shows a
    // full-screen recover screen instead of a blank window.
    errorElement: <RootErrorFallback />,
    children: [
  { path: "/", element: <RootRedirect /> },
  { path: "/companies", element: <CompanyPickerGuard /> },
  { path: "/login", element: <Login /> },
  { path: "/shops", element: <ShopsGuard /> },
  // Older entry points: everything now starts at login, then "My shops".
  { path: "/onboarding", element: <Navigate to="/login" replace /> },
  { path: "/create-company", element: <Navigate to="/shops" replace /> },
  { path: "/join-company", element: <Navigate to="/shops" replace /> },
  {
    element: <AuthGuard />,
    children: [
      {
        // Screen-level catch: renders inside the Shell (sidebar/header stay),
        // so one screen crashing never takes down the whole till.
        errorElement: <ScreenErrorFallback />,
        children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/products", element: <Products /> },
      { path: "/products/new", element: <ProductForm /> },
      { path: "/products/:productId/edit", element: <ProductForm /> },
      { path: "/products/:productId/receive", element: <StockReceive /> },
      { path: "/products/:productId/adjust", element: <StockAdjust /> },
      { path: "/products/:productId/supplier-return", element: <StockSupplierReturn /> },
      { path: "/products/:productId/inventory", element: <ProductInventory /> },
      { path: "/stock-count", element: <StockCount /> },
      { path: "/print-labels", element: <PrintLabels /> },
      { path: "/alerts", element: <Alerts /> },
      { path: "/demand-forecast", element: <DemandForecast /> },
      { path: "/dead-stock", element: <DeadStock /> },
      { path: "/bulk-stock", element: <BulkStockRegister /> },
      { path: "/archived", element: <Archived /> },
      { path: "/pos", element: <Pos /> },
      { path: "/cash-register", element: <CashRegister /> },
      { path: "/held-sales", element: <HeldSales /> },
      { path: "/sales", element: <SalesHistory /> },
      { path: "/sales/:saleId", element: <SaleDetail /> },
      { path: "/categories", element: <Categories /> },
      { path: "/suppliers", element: <Suppliers /> },
      { path: "/customers", element: <Customers /> },
      { path: "/gift-cards", element: <GiftCards /> },
      { path: "/receive", element: <ReceiveStockPicker /> },
      { path: "/purchase-orders", element: <PurchaseOrders /> },
      { path: "/purchase-orders/new", element: <PurchaseOrderForm /> },
      { path: "/purchase-orders/:poId", element: <PurchaseOrderDetail /> },
      { path: "/reconciliation", element: <Reconciliation /> },
      { path: "/reports", element: <Reports /> },
      { path: "/inventory-report", element: <InventoryReport /> },
      { path: "/customer-credits", element: <CustomerCredits /> },
      { path: "/tax-declaration", element: <TaxDeclaration /> },
      { path: "/printer", element: <PrinterSettings /> },
      { path: "/data", element: <DataMaintenance /> },
      { path: "/staff", element: <Staff /> },
      { path: "/settings", element: <CompanySettings /> },
      { path: "/support", element: <Support /> },
      // Any nav destination without a screen yet (Printer) falls back to a placeholder.
      ...ALL_NAV_ITEMS.filter(
        (i) =>
          ![
            "/dashboard",
            "/support",
            "/products",
            "/bulk-stock",
            "/archived",
            "/stock-count",
            "/print-labels",
            "/alerts",
            "/demand-forecast",
            "/dead-stock",
            "/pos",
            "/cash-register",
            "/held-sales",
            "/sales",
            "/categories",
            "/suppliers",
            "/customers",
            "/gift-cards",
            "/receive",
            "/purchase-orders",
            "/reports",
            "/inventory-report",
            "/customer-credits",
            "/tax-declaration",
            "/printer",
            "/data",
            "/staff",
            "/settings",
          ].includes(i.path),
      ).map((i) => ({
        path: i.path,
        element: <Placeholder title={i.label} />,
      })),
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
