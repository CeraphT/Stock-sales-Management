namespace PharmaStock.Domain.Models;

/// <summary>Lifecycle of a single serialized/IMEI unit (see ProductSerial).
/// Serialized as a raw integer over the wire (no JsonStringEnumConverter is
/// registered), so client-side enums must match this declaration order.</summary>
public enum SerialStatus
{
    InStock, // received, available to sell
    Sold,    // deducted by a sale, linked to that SaleId
    Returned // returned by the customer, not yet re-stocked
}
