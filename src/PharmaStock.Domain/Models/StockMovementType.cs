namespace PharmaStock.Domain.Models;

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
