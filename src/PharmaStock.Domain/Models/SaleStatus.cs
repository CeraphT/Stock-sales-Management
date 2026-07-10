namespace PharmaStock.Domain.Models;

public enum SaleStatus
{
    Completed,
    Held,       // parked sale, resumable later (Section 18.1)
    Cancelled,
    Refunded
}
