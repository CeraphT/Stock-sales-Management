/** Quantity for a one-tap "order from supplier": refill past the low-stock
 * threshold (to twice it, like the "New order" restock suggestions) so the
 * threshold is never used as the order size itself. A starting point only:
 * editable on the order, and a delivery may exceed it. */
export function reorderQuantity(lowStockThreshold: number, currentStock: number): number {
  const threshold = Math.max(lowStockThreshold, 0);
  return Math.max(threshold * 2 - Math.max(currentStock, 0), threshold, 1);
}
