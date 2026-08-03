// One line per product, no header row. Columns, in order:
// Product Name | Barcode | Category | Purchase Price | Sale Price | Low Stock Threshold | Batch Number | Expiry Date (YYYY-MM-DD) | Quantity
//
// Purchase Price / Sale Price / Low Stock Threshold are only required when
// the product doesn't already exist (matched by barcode, falling back to
// an exact case-insensitive name match) — for restocking an existing
// product they can be left blank. Batch Number and Quantity are always
// required; Expiry Date and Category are always optional.
export const COLUMN_COUNT = 9;

export interface BulkStockRow {
  lineNumber: number;
  productName: string;
  barcode: string | null;
  categoryName: string | null;
  purchasePrice: string;
  salePrice: string;
  lowStockThreshold: string;
  batchNumber: string;
  expiryDate: string | null;
  quantity: string;
}

export interface ExistingProduct {
  id: string;
  name: string;
  barcode: string | null;
}

export interface ExistingCategory {
  id: string;
  name: string;
}

export type ParsedBulkStockRow =
  | {
      lineNumber: number;
      kind: "update";
      productId: string;
      productName: string;
      batchNumber: string;
      expiryDate: string | null;
      quantity: number;
      purchasePricePerBaseUnit: number | null;
    }
  | {
      lineNumber: number;
      kind: "create";
      productName: string;
      barcode: string | null;
      categoryId: string | null;
      categoryWarning: string | null;
      purchasePrice: number;
      salePrice: number;
      lowStockThreshold: number;
      batchNumber: string;
      expiryDate: string | null;
      quantity: number;
    }
  | {
      lineNumber: number;
      kind: "error";
      productName: string;
      message: string;
    };

/** Splits one pasted line into columns — Excel's copy puts a tab between
 * cells, a plain CSV file uses commas; support both so it doesn't matter
 * which one someone pastes from. */
function splitLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((cell) => cell.trim());
}

export function parseRawText(text: string): BulkStockRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const cells = splitLine(line);
      const get = (i: number) => (cells[i] ?? "").trim();
      return {
        lineNumber: index + 1,
        productName: get(0),
        barcode: get(1) || null,
        categoryName: get(2) || null,
        purchasePrice: get(3),
        salePrice: get(4),
        lowStockThreshold: get(5),
        batchNumber: get(6),
        expiryDate: get(7) || null,
        quantity: get(8),
      };
    });
}

export function resolveRows(
  rows: BulkStockRow[],
  existingProducts: ExistingProduct[],
  existingCategories: ExistingCategory[],
): ParsedBulkStockRow[] {
  const byBarcode = new Map(existingProducts.filter((p) => p.barcode).map((p) => [p.barcode as string, p]));
  const byName = new Map(existingProducts.map((p) => [p.name.trim().toLowerCase(), p]));
  const categoriesByName = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  return rows.map((row): ParsedBulkStockRow => {
    if (!row.productName) {
      return { lineNumber: row.lineNumber, kind: "error", productName: "(blank)", message: "Missing product name." };
    }
    if (!row.batchNumber) {
      return { lineNumber: row.lineNumber, kind: "error", productName: row.productName, message: "Missing batch/lot number." };
    }
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { lineNumber: row.lineNumber, kind: "error", productName: row.productName, message: "Quantity must be a positive whole number." };
    }

    const existing = (row.barcode && byBarcode.get(row.barcode)) || byName.get(row.productName.trim().toLowerCase());

    if (existing) {
      const purchasePricePerBaseUnit = row.purchasePrice.trim() ? Number(row.purchasePrice) : null;
      if (purchasePricePerBaseUnit != null && (!Number.isFinite(purchasePricePerBaseUnit) || purchasePricePerBaseUnit < 0)) {
        return { lineNumber: row.lineNumber, kind: "error", productName: row.productName, message: "Purchase price must be zero or positive." };
      }
      return {
        lineNumber: row.lineNumber,
        kind: "update",
        productId: existing.id,
        productName: existing.name,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        quantity,
        purchasePricePerBaseUnit,
      };
    }

    const purchasePrice = Number(row.purchasePrice);
    const salePrice = Number(row.salePrice);
    if (!row.purchasePrice.trim() || !row.salePrice.trim() || !Number.isFinite(purchasePrice) || !Number.isFinite(salePrice)) {
      return {
        lineNumber: row.lineNumber,
        kind: "error",
        productName: row.productName,
        message: "New product — purchase price and sale price are required.",
      };
    }
    if (purchasePrice < 0 || salePrice < 0) {
      return { lineNumber: row.lineNumber, kind: "error", productName: row.productName, message: "Prices must be zero or positive." };
    }
    const lowStockThreshold = row.lowStockThreshold.trim() ? Number(row.lowStockThreshold) : 0;
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      return { lineNumber: row.lineNumber, kind: "error", productName: row.productName, message: "Low stock threshold must be zero or positive." };
    }

    let categoryId: string | null = null;
    let categoryWarning: string | null = null;
    if (row.categoryName) {
      const match = categoriesByName.get(row.categoryName.trim().toLowerCase());
      if (match) categoryId = match.id;
      else categoryWarning = `Category "${row.categoryName}" doesn't exist yet — created without a category.`;
    }

    return {
      lineNumber: row.lineNumber,
      kind: "create",
      productName: row.productName,
      barcode: row.barcode,
      categoryId,
      categoryWarning,
      purchasePrice,
      salePrice,
      lowStockThreshold,
      batchNumber: row.batchNumber,
      expiryDate: row.expiryDate,
      quantity,
    };
  });
}
