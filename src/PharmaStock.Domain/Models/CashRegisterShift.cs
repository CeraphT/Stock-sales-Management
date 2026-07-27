namespace PharmaStock.Domain.Models;

/// <summary>Section 3.6 — a cashier's till session at one Location, from
/// opening float count to closing cash count. Sales record which shift they
/// happened under (Sale.ShiftId, nullable — a company that doesn't use shift
/// tracking can just never open one and sales proceed unaffected) so closing
/// can compute an expected cash total to reconcile against what was actually
/// counted, without re-deriving it from a date range that could straddle
/// someone else's shift at the same location.</summary>
public class CashRegisterShift
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public Guid LocationId { get; set; }
    public Location? Location { get; set; }

    /// <summary>Who opened (and is accountable for) this shift.</summary>
    public Guid OpenedByUserId { get; set; }
    public User? OpenedByUser { get; set; }

    public Guid? ClosedByUserId { get; set; }
    public User? ClosedByUser { get; set; }

    public ShiftStatus Status { get; set; } = ShiftStatus.Open;

    public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }

    /// <summary>Cash counted into the till at open — the starting float.</summary>
    public decimal OpeningCashAmount { get; set; }

    /// <summary>Cash physically counted at close, entered by the cashier.
    /// Null while the shift is still open.</summary>
    public decimal? ClosingCashAmount { get; set; }

    /// <summary>OpeningCashAmount + cash-settled sales recorded under this
    /// shift (including the cash portion of split payments) — computed once
    /// at close time and stored rather than left as a live query, so a
    /// closed shift's report never shifts under a manager reviewing it later
    /// even if, say, a sale's payment method were somehow corrected after.</summary>
    public decimal? ExpectedCashAmount { get; set; }

    /// <summary>ClosingCashAmount - ExpectedCashAmount. Positive means more
    /// cash was counted than expected (overage); negative means a shortage.</summary>
    public decimal? Discrepancy { get; set; }

    public string? ClosingNotes { get; set; }

    public ICollection<Sale> Sales { get; set; } = new List<Sale>();

    /// <summary>Section 6 — same meaning as Sale.SyncStatus: PendingPush only
    /// for a shift opened/closed locally on an offline device.</summary>
    public SyncStatus SyncStatus { get; set; } = SyncStatus.Synced;
}
