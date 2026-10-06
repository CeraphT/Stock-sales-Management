namespace PharmaStock.Domain.Models;

/// <summary>A person's account: phone + password, globally unique phone (SuperAdmin
/// accounts aside). Which businesses they work in, and with which role and
/// restrictions, lives in <see cref="CompanyMembership"/>. Role here only marks a
/// platform SuperAdmin (Section 22.6); for everyone else it is a legacy value.</summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Legacy: the business this account was first created in (accounts
    /// predating memberships). Null for SuperAdmins and for accounts created through
    /// self sign-up. Not used for access: memberships are the source of truth.</summary>
    public Guid? CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    /// <summary>Optional contact email. Login is by phone, so this is metadata
    /// (notifications, identifying a SuperAdmin) rather than a credential.</summary>
    public string? Email { get; set; }
    public UserRole Role { get; set; } = UserRole.Cashier;
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Section 21.5 — stored per user, not per company, so each staff
    /// member can pick their own display language.</summary>
    public string PreferredLanguage { get; set; } = "fr";

    /// <summary>Section 21.2 — TOTP secret, only ever populated for Web admin
    /// accounts that have chosen to enable 2FA. Null means 2FA is off.</summary>
    public string? TwoFactorTotpSecret { get; set; }
    public bool TwoFactorEnabled { get; set; } = false;

    public bool Active { get; set; } = true;

    /// <summary>Legacy, superseded by CompanyMembership.Restrict* (kept so old rows
    /// still read). Per-user feature restrictions, Cashier accounts only — all default
    /// false (unrestricted) so a new/existing cashier keeps full access unless a
    /// CompanyAdmin explicitly locks a feature down. Meaningless for Admin/SuperAdmin
    /// callers, who always pass every check regardless of these values.</summary>
    public bool RestrictCatalog { get; set; } = false;
    public bool RestrictPurchasing { get; set; } = false;
    public bool RestrictCustomers { get; set; } = false;
    public bool RestrictReportsAndFullSales { get; set; } = false;
    public bool RestrictCashRegister { get; set; } = false;
    public bool RestrictGiftCards { get; set; } = false;

    public ICollection<Device> Devices { get; set; } = new List<Device>();
    public ICollection<CompanyMembership> Memberships { get; set; } = new List<CompanyMembership>();
}
