import { create } from "zustand";

export interface CartLine {
  /** productId + packagingLevelId (or "base") — dedupe key so scanning/
   * adding the same product+level twice bumps quantity instead of adding
   * a second row. */
  key: string;
  productId: string;
  productName: string;
  packagingLevelId: string | null;
  packagingLevelName: string | null;
  /** Price for one unit at this packaging level (already resolved — see
   * localCatalogQueryService's PackagingLevelInfo.unitPrice /
   * ProductSearchResult.salePrice). */
  unitPrice: number;
  /** In the packaging-level's own unit (e.g. "2 boxes"), not base units —
   * localSalesService.createSale expects quantity in this same shape. For a
   * sell-by-measure line, this is the whole number of base units (e.g. grams). */
  quantity: number;
  /** Set for sell-by-measure lines so the cart/receipt can show the quantity as
   * the display unit (e.g. grams shown as kg) and the price per that unit. */
  measureUnit?: string | null;
  unitsPerMeasure?: number;
}

export interface CartServiceLine {
  /** serviceId — services can't be split by packaging level like products,
   * so the id alone is a unique dedupe key. */
  key: string;
  serviceId: string;
  serviceName: string;
  unitPrice: number;
  quantity: number;
  /** Resolved from the live picker fetch and carried on the cart line
   * itself — see checkout.tsx's online-only service checkout path for why
   * (no local Services table to look this back up from). */
  stockLinks: { productId: string; quantityConsumedInBaseUnits: number }[];
}

interface CartState {
  lines: CartLine[];
  serviceLines: CartServiceLine[];
  customerId: string | null;
  customerName: string | null;
  addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  addServiceLine: (line: Omit<CartServiceLine, "quantity">, quantity?: number) => void;
  updateServiceQuantity: (key: string, quantity: number) => void;
  removeServiceLine: (key: string) => void;
  setCustomer: (customer: { id: string; name: string } | null) => void;
  clear: () => void;
  loadLines: (lines: CartLine[], customerId: string | null, customerName: string | null) => void;
}

export const useCartStore = create<CartState>()((set) => ({
  lines: [],
  serviceLines: [],
  customerId: null,
  customerName: null,

  addLine: (line, quantity = 1) =>
    set((state) => {
      const existing = state.lines.find((l) => l.key === line.key);
      if (existing) {
        return {
          lines: state.lines.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l)),
        };
      }
      return { lines: [...state.lines, { ...line, quantity }] };
    }),

  updateQuantity: (key, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

  addServiceLine: (line, quantity = 1) =>
    set((state) => {
      const existing = state.serviceLines.find((l) => l.key === line.key);
      if (existing) {
        return {
          serviceLines: state.serviceLines.map((l) =>
            l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l,
          ),
        };
      }
      return { serviceLines: [...state.serviceLines, { ...line, quantity }] };
    }),

  updateServiceQuantity: (key, quantity) =>
    set((state) => ({
      serviceLines:
        quantity <= 0
          ? state.serviceLines.filter((l) => l.key !== key)
          : state.serviceLines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    })),

  removeServiceLine: (key) => set((state) => ({ serviceLines: state.serviceLines.filter((l) => l.key !== key) })),

  setCustomer: (customer) => set({ customerId: customer?.id ?? null, customerName: customer?.name ?? null }),

  clear: () => set({ lines: [], serviceLines: [], customerId: null, customerName: null }),

  loadLines: (lines, customerId, customerName) => set({ lines, serviceLines: [], customerId, customerName }),
}));

export function cartTotal(lines: CartLine[], serviceLines: CartServiceLine[] = []): number {
  const productTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const serviceTotal = serviceLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return productTotal + serviceTotal;
}
