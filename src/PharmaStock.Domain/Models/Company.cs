namespace PharmaStock.Domain.Models;

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

    /// <summary>Section 18.3 — default VAT/TVA rate applied to a product unless
    /// it sets its own Product.TaxRateOverridePercent (e.g. Cameroon's ~19.25%
    /// standard TVA doesn't apply uniformly to every pharmaceutical product).</summary>
    public decimal DefaultTaxRatePercent { get; set; } = 19.25m;

    /// <summary>Serialized theme config (Section 10): primary/secondary color, font choice, dark mode.</summary>
    public string? ThemeConfigJson { get; set; }

    /// <summary>Master toggle for the Optional Additional Services Module (Section 20).
    /// False by default — when false, no service-related screen or report renders anywhere.</summary>
    public bool ServicesModuleEnabled { get; set; } = false;

    /// <summary>Section 21.3 — master toggle for loyalty points. False by
    /// default: a company that never turns this on simply never accrues
    /// LoyaltyAccount.PointsBalance on any sale, same pattern as
    /// ServicesModuleEnabled.</summary>
    public bool LoyaltyEnabled { get; set; } = false;

    /// <summary>A customer earns 1 point per this many currency units spent
    /// on a sale attributed to them (floor division — partial points don't
    /// accrue). E.g. 100 with Sale.Total = 250 earns 2 points.</summary>
    public decimal LoyaltyEarnRateAmount { get; set; } = 100m;

    /// <summary>Currency value of a single point when a customer redeems
    /// points into LoyaltyAccount.StoreCreditBalance (Section 21.3) — e.g. 10
    /// means 1 point = 10 XAF of spendable store credit.</summary>
    public decimal LoyaltyPointValue { get; set; } = 10m;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Location> Locations { get; set; } = new List<Location>();
    public ICollection<Product> Products { get; set; } = new List<Product>();
    public ICollection<Supplier> Suppliers { get; set; } = new List<Supplier>();
    public ICollection<Customer> Customers { get; set; } = new List<Customer>();
    public ICollection<Service> Services { get; set; } = new List<Service>();
    public ICollection<GiftCard> GiftCards { get; set; } = new List<GiftCard>();
    public ICollection<CustomFieldDefinition> CustomFieldDefinitions { get; set; } = new List<CustomFieldDefinition>();
}
