// Information architecture for the sidebar — mirrors the deleted MAUI app's
// flyout grouping (see docs/desktop-rebuild.md §7.1). Icons are emoji
// placeholders for the foundation; swap for lucide-react later.
export interface NavItem {
  label: string;
  path: string;
  icon: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { title: "", items: [{ label: "Dashboard", path: "/dashboard", icon: "🏠" }] },
  {
    title: "Sales",
    items: [
      { label: "Point of sale", path: "/pos", icon: "🧾" },
      { label: "Cash register", path: "/cash-register", icon: "💵" },
      { label: "Sales history", path: "/sales", icon: "🕘" },
      { label: "Held sales", path: "/held-sales", icon: "⏸️" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", path: "/products", icon: "📦" },
      { label: "Bulk stock", path: "/bulk-stock", icon: "📋" },
      { label: "Categories", path: "/categories", icon: "🏷️" },
      { label: "Archived", path: "/archived", icon: "🗄️" },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { label: "Suppliers", path: "/suppliers", icon: "🚚" },
      { label: "Purchase orders", path: "/purchase-orders", icon: "📋" },
    ],
  },
  {
    title: "Clients",
    items: [
      { label: "Customers", path: "/customers", icon: "📇" },
      { label: "Gift cards", path: "/gift-cards", icon: "🎁" },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Reports", path: "/reports", icon: "📊" },
      { label: "Inventory report", path: "/inventory-report", icon: "📦" },
      { label: "Customer credits", path: "/customer-credits", icon: "💳" },
      { label: "Tax declaration", path: "/tax-declaration", icon: "🧾" },
      { label: "Staff", path: "/staff", icon: "👥" },
      { label: "Printer", path: "/printer", icon: "🖨️" },
      { label: "Company settings", path: "/settings", icon: "🏢" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
