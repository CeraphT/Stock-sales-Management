namespace PharmaStock.Domain.Models;

/// <summary>A staff account, scoped to a single company (Section 3.7), except for
/// the SuperAdmin role which sits outside any one company's data (Section 22.6).</summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Null only for SuperAdmin accounts, which are not owned by any single company.</summary>
    public Guid? CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
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

    /// <summary>Per-user feature restrictions, Cashier accounts only — all default
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
}
