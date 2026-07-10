using PharmaStock.Domain.Enums;

namespace PharmaStock.Domain.Entities;

/// <summary>
/// A tenant company using the app (Section 9). Every other entity in the system
/// is scoped to a CompanyId, which is what makes the Super Admin client-switcher
/// (Section 22) and the multi-tenant onboarding (Section 9) safe: nothing crosses
/// this boundary except through the Super Admin's explicit client selection.
/// </summary>
public class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? LogoUrl { get; set; }

    /// <summary>Unique onboarding code (Section 9) — the anti-duplicate mechanism.
    /// Other devices "join" a company by presenting this code rather than
    /// re-creating a company record, which eliminates duplicate risk by design.</summary>
    public string UniqueCode { get; set; } = string.Empty;

    public string Currency { get; set; } = "XAF";

    /// <summary>Serialized theme config (Section 10): primary/secondary color, font choice, dark mode.</summary>
    public string? ThemeConfigJson { get; set; }

    /// <summary>Master toggle for the Optional Additional Services Module (Section 20).
    /// False by default — when false, no service-related screen or report renders anywhere.</summary>
    public bool ServicesModuleEnabled { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Product> Products { get; set; } = new List<Product>();
    public ICollection<Supplier> Suppliers { get; set; } = new List<Supplier>();
    public ICollection<Customer> Customers { get; set; } = new List<Customer>();
    public ICollection<Service> Services { get; set; } = new List<Service>();
    public ICollection<GiftCard> GiftCards { get; set; } = new List<GiftCard>();
    public ICollection<CustomFieldDefinition> CustomFieldDefinitions { get; set; } = new List<CustomFieldDefinition>();
}

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

    public ICollection<Device> Devices { get; set; } = new List<Device>();
}

/// <summary>Section 21.1 — one row per device/session a user has authenticated
/// from. This is what powers both the per-company device list (Web Admin) and
/// the cross-company aggregate view (Super Admin, Section 22.4).</summary>
public class Device
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User? User { get; set; }

    /// <summary>Denormalized for fast per-company/cross-company counting without
    /// always joining through User — Section 21.1 and 22.4 both query by this.</summary>
    public Guid? CompanyId { get; set; }

    public DevicePlatform Platform { get; set; }
    public string DeviceName { get; set; } = string.Empty;
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set true by an admin from the Web device list (Section 21.1).
    /// The device's next API call is rejected and it must re-authenticate.</summary>
    public bool IsRevoked { get; set; } = false;

    /// <summary>Set true alongside IsRevoked when hardware is confirmed lost.
    /// The device checks this flag on its next successful contact and wipes
    /// its local database before anything else happens.</summary>
    public bool RemoteWipeRequested { get; set; } = false;
}
