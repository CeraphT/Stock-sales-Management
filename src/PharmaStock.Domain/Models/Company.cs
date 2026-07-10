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
