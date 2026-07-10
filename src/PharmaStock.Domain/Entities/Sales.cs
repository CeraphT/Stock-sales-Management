using PharmaStock.Domain.Enums;

namespace PharmaStock.Domain.Entities;

public class Customer
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }

    /// <summary>Section 3.5 — running credit/debt balance for regular customers.
    /// Positive means the customer owes the business; negative means the
    /// business owes the customer (e.g. an unrefunded return, Section 21.3).</summary>
    public decimal CreditBalance { get; set; } = 0;

    /// <summary>Section 21.3 — one-to-one, kept as a separate entity so a
    /// company that never enables loyalty/credit has simply no rows here.</summary>
    public LoyaltyAccount? LoyaltyAccount { get; set; }
}

/// <summary>Section 21.3 — loyalty points and store-credit balance for a
/// customer. Deliberately separate from Customer.CreditBalance (which is
/// simple purchase-on-credit debt) since loyalty points follow different
/// earn/redeem rules than a debt balance.</summary>
public class LoyaltyAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public int PointsBalance { get; set; } = 0;
    public decimal StoreCreditBalance { get; set; } = 0;
}

/// <summary>Section 21.3 — a prepaid gift card, tracked independently of any
/// single customer so it can be gifted/transferred and redeemed by whoever holds the code.</summary>
public class GiftCard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Code { get; set; } = string.Empty;
    public decimal InitialValue { get; set; }
    public decimal RemainingValue { get; set; }
    public bool Active { get; set; } = true;
}

/// <summary>A single transaction (Section 3.1). Can hold product lines,
/// service lines (Section 20), or both on the same receipt.</summary>
public class Sale
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public decimal Total { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public SaleStatus Status { get; set; } = SaleStatus.Completed;

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public ICollection<SaleLine> ProductLines { get; set; } = new List<SaleLine>();
    public ICollection<ServiceLine> ServiceLines { get; set; } = new List<ServiceLine>();
    public ICollection<PaymentSplit> PaymentSplits { get; set; } = new List<PaymentSplit>();
    public InstallmentPlan? InstallmentPlan { get; set; }
}

public class SaleLine
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public Guid? BatchId { get; set; }
    public Batch? Batch { get; set; }

    /// <summary>In base units regardless of which packaging level was sold —
    /// e.g. selling "1 box" of a 100-capsule box records Quantity = 100 here,
    /// while the receipt still displays "1 box" using PackagingLevelId.</summary>
    public int QuantityInBaseUnits { get; set; }

    public Guid? PackagingLevelId { get; set; }
    public ProductPackagingLevel? PackagingLevel { get; set; }

    public decimal UnitPrice { get; set; }
}

/// <summary>Section 18.1 — split payment: a sale can be paid through more
/// than one method (e.g. part cash, part Mobile Money). When a sale has
/// exactly one payment method, PaymentSplits may be empty and Sale.PaymentMethod
/// alone is authoritative.</summary>
public class PaymentSplit
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SaleId { get; set; }
    public Sale? Sale { get; set; }

    public PaymentMethod Method { get; set; }
    public decimal Amount { get; set; }
}
