namespace PharmaStock.Domain.Models;

/// <summary>Links a person's account (User, identified by phone) to a business they
/// work in. One account can belong to several businesses, with a different role and
/// different restrictions in each, which is why role and restrictions live here and
/// not on User. A shop-scoped JWT carries this row's CompanyId and Role.</summary>
public class CompanyMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    /// <summary>Cashier or CompanyAdmin (never SuperAdmin: that is a platform role on User).</summary>
    public UserRole Role { get; set; } = UserRole.Cashier;
    public MembershipStatus Status { get; set; } = MembershipStatus.Active;

    /// <summary>Per-business feature restrictions, Cashier only. Same names as the
    /// former User flags so every restriction check reads unchanged.</summary>
    public bool RestrictCatalog { get; set; } = false;
    public bool RestrictPurchasing { get; set; } = false;
    public bool RestrictCustomers { get; set; } = false;
    public bool RestrictReportsAndFullSales { get; set; } = false;
    public bool RestrictCashRegister { get; set; } = false;
    public bool RestrictGiftCards { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>When an admin approved (or rejected) a join request.</summary>
    public DateTime? DecidedAt { get; set; }
    public Guid? DecidedByUserId { get; set; }
}
