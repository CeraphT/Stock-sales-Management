// Mirrors PharmaStock.Domain.Models enums exactly — C# enums serialize as
// their raw numeric value (no JsonStringEnumConverter configured server-
// side), so these values must match the C# declaration order precisely.

export enum TaxRegime {
  /** Régime du réel/simplifié — collects TVA on sales. */
  Standard = 0,
  /** Impôt libératoire — flat periodic lump-sum, no TVA on sales. */
  FlatRate = 1,
}

export enum FlatTaxPeriod {
  Monthly = 0,
  Quarterly = 1,
  Yearly = 2,
}

export enum UserRole {
  Cashier = 0,
  CompanyAdmin = 1,
  SuperAdmin = 2,
}

export enum DevicePlatform {
  Desktop = 0,
  Mobile = 1,
  Web = 2,
}

export enum PaymentMethod {
  Cash = 0,
  MobileMoney = 1,
  Credit = 2,
  StoreCredit = 3,
  GiftCard = 4,
  Split = 5,
}

export enum SaleStatus {
  Completed = 0,
  Held = 1,
  Cancelled = 2,
  Refunded = 3,
}

export enum StockMovementType {
  Entry = 0,
  Sale = 1,
  Adjustment = 2,
  Return = 3,
  SupplierReturn = 4,
  Transfer = 5,
  ServiceConsumption = 6,
}

export enum PurchaseOrderStatus {
  Pending = 0,
  PartiallyReceived = 1,
  Received = 2,
  Cancelled = 3,
}

export enum ShiftStatus {
  Open = 0,
  Closed = 1,
}

export enum SyncStatus {
  Synced = 0,
  PendingPush = 1,
}

/** "in_stock" | "low_stock" | "out_of_stock" — a raw string from the API, not a C# enum. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
