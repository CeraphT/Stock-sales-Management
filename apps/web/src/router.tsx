import { UserRole } from "@stockflow/core/api/enums";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { RootErrorFallback, ScreenErrorFallback } from "@/components/Errors";
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
import { TaxDeclaration } from "@/screens/TaxDeclaration";
import { Placeholder } from "@/screens/Placeholder";
import { Pos } from "@/screens/Pos";
import { ProductForm } from "@/screens/ProductForm";
import { PurchaseOrderDetail } from "@/screens/PurchaseOrderDetail";
import { PurchaseOrderForm } from "@/screens/PurchaseOrderForm";
import { PurchaseOrders } from "@/screens/PurchaseOrders";
import { ProductInventory } from "@/screens/ProductInventory";
import { Products } from "@/screens/Products";
import { SaleDetail } from "@/screens/SaleDetail";
import { StockAdjust } from "@/screens/StockAdjust";
import { StockReceive } from "@/screens/StockReceive";
import { Suppliers } from "@/screens/Suppliers";
import { SalesHistory } from "@/screens/SalesHistory";
import { Shell } from "@/screens/Shell";
import { CreateCompany } from "@/screens/auth/CreateCompany";
import { JoinCompany } from "@/screens/auth/JoinCompany";
import { Login } from "@/screens/auth/Login";
import { Onboarding } from "@/screens/auth/Onboarding";
import { SuperAdminAdmins } from "@/screens/superadmin/Admins";
import { SuperAdminCompanies } from "@/screens/superadmin/Companies";
import { SuperAdminCompanyDetail } from "@/screens/superadmin/CompanyDetail";
import { SuperAdminShell } from "@/screens/superadmin/SuperAdminShell";

function RootRedirect() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/onboarding" replace />;
  // A SuperAdmin with no company of their own lands on the console; once they
  // enter a company (impersonating), they belong in the scoped app.
  if (role === UserRole.SuperAdmin && !impersonating) return <Navigate to="/superadmin" replace />;
  return <Navigate to="/dashboard" replace />;
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
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/onboarding" replace />;
  // A non-impersonating SuperAdmin has no company context — keep them out of
  // the scoped app and on the console.
  if (role === UserRole.SuperAdmin && !impersonating) return <Navigate to="/superadmin" replace />;
  if (dbError) return <FullScreenMessage title="Local database error" body={dbError} />;
  if (!dbReady) return <FullScreenMessage title="Preparing local database…" />;
  return <Shell />;
}

/** Layout route for the cross-tenant super-admin console. */
function SuperAdminGuard() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const impersonating = useImpersonation((s) => s.active);
  if (!hasHydrated) return null;
  if (!token) return <Navigate to="/onboarding" replace />;
  if (role !== UserRole.SuperAdmin) return <Navigate to="/dashboard" replace />;
  // While impersonating, the console is off-limits — they're inside a company.
  if (impersonating) return <Navigate to="/dashboard" replace />;
  return <SuperAdminShell />;
}

export const router = createBrowserRouter([
  {
    // Top-level catch: a crash on a public route or outside the shell shows a
    // full-screen recover screen instead of a blank window.
    errorElement: <RootErrorFallback />,
    children: [
  { path: "/", element: <RootRedirect /> },
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/login", element: <Login /> },
  { path: "/create-company", element: <CreateCompany /> },
  { path: "/join-company", element: <JoinCompany /> },
  {
    element: <SuperAdminGuard />,
    children: [
      {
        errorElement: <ScreenErrorFallback />,
        children: [
          { path: "/superadmin", element: <SuperAdminCompanies /> },
          { path: "/superadmin/companies/:id", element: <SuperAdminCompanyDetail /> },
          { path: "/superadmin/admins", element: <SuperAdminAdmins /> },
        ],
      },
    ],
  },
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
      { path: "/products/:productId/inventory", element: <ProductInventory /> },
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
      // Any nav destination without a screen yet (Printer) falls back to a placeholder.
      ...ALL_NAV_ITEMS.filter(
        (i) =>
          ![
            "/dashboard",
            "/products",
            "/bulk-stock",
            "/archived",
            "/pos",
            "/cash-register",
            "/held-sales",
            "/sales",
            "/categories",
            "/suppliers",
            "/customers",
            "/gift-cards",
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
