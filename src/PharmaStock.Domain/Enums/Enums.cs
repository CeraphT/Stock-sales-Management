namespace PharmaStock.Domain.Enums;

public enum UserRole
{
    Cashier,
    CompanyAdmin,
    SuperAdmin
}

public enum DevicePlatform
{
    Desktop,
    Mobile,
    Web
}

public enum StockMovementType
{
    Entry,          // supplier receipt
    Sale,           // deducted by a sale
    Adjustment,     // manual correction (breakage, theft, expiry)
    Return,         // customer return re-added to stock
    SupplierReturn, // sent back to supplier
    Transfer,       // moved to/from another location/branch
    ServiceConsumption // consumed automatically by a linked service (Section 20.6)
}

public enum PaymentMethod
{
    Cash,
    MobileMoney,
    Credit,
    StoreCredit,
    GiftCard,
    Split // combination of the above, detail held in PaymentSplit
}

public enum SaleStatus
{
    Completed,
    Held,       // parked sale, resumable later (Section 18.1)
    Cancelled,
    Refunded
}

public enum InstallmentMode
{
    Layaway,          // goods held back until fully paid
    InstallmentCredit // goods released immediately, balance collected over time
}

public enum CustomFieldEntityType
{
    Product,
    Customer,
    Supplier
}

public enum CustomFieldType
{
    Text,
    Number,
    Date,
    YesNo
}
