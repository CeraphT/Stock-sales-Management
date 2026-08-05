namespace PharmaStock.Domain.Models;

/// <summary>A single transaction (Section 3.1). Can hold product lines,
/// service lines (Section 20), or both on the same receipt.</summary>
public class Sale
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    /// <summary>Section 16.6 — which branch rang up this sale. Required: FEFO
    /// deduction is scoped to this location's own batches.</summary>
    public Guid LocationId { get; set; }
    public Location? Location { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    /// <summary>Section 3.6 — which cash-register shift was open at this
    /// location when the sale happened, if any. Null when the company isn't
    /// using shift tracking (or no shift happened to be open) — sales are
    /// never blocked on this.</summary>
    public Guid? ShiftId { get; set; }
    public CashRegisterShift? Shift { get; set; }

    public decimal Total { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public SaleStatus Status { get; set; } = SaleStatus.Completed;

    /// <summary>True when this was a B2B (business customer) sale — VAT was
    /// ADDED on top of the net line prices, so Total = Σ line prices + VAT.
    /// False = the normal VAT-inclusive (TTC) sale where Total = Σ line prices.
    /// Captured per sale so receipts/reports reconstruct the VAT correctly even
    /// if the customer's business flag later changes.</summary>
    public bool TaxAddedOnTop { get; set; } = false;

    /// <summary>Sequential tax-invoice number assigned at sale time (from
    /// Company.NextInvoiceNumber). Null for held sales.</summary>
    public int? InvoiceNumber { get; set; }

    /// <summary>Section 3.1 cashier aid — how much physical cash the customer
    /// handed over and how much change was given back for the sale's cash
    /// leg (whether the whole sale is Cash or just a Split leg is). Both
    /// null when the sale has no cash component, or the cashier didn't use
    /// the helper (exact payment, no change).</summary>
    public decimal? AmountTendered { get; set; }
    public decimal? ChangeDue { get; set; }

    /// <summary>Section 21.3 — which gift card was redeemed against this
    /// sale, if PaymentMethod (or a PaymentSplits leg) is GiftCard. Null
    /// otherwise. Stored on the sale itself (not just applied to
    /// GiftCard.RemainingValue and forgotten) so a receipt/sale-detail can
    /// show which card paid for it, and so sync push can carry it along for
    /// the server to independently re-derive and re-apply the same
    /// deduction when the sale eventually syncs.</summary>
    public string? GiftCardCode { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public ICollection<SaleLine> ProductLines { get; set; } = new List<SaleLine>();
    public ICollection<ServiceLine> ServiceLines { get; set; } = new List<ServiceLine>();
    public ICollection<PaymentSplit> PaymentSplits { get; set; } = new List<PaymentSplit>();
    public InstallmentPlan? InstallmentPlan { get; set; }

    /// <summary>Section 6 — Synced for every sale created through the online
    /// API (the overwhelming majority); PendingPush only for a sale created
    /// locally on an offline device, until sync push confirms it server-side.</summary>
    public SyncStatus SyncStatus { get; set; } = SyncStatus.Synced;
}
