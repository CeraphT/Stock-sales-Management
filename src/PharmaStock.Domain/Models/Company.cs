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

    /// <summary>Logo as a data URI (base64) so no separate file host is needed —
    /// shown on receipts and PDF reports.</summary>
    public string? LogoUrl { get; set; }

    /// <summary>Business address + phone, printed on receipts and purchase
    /// orders so the customer/supplier can identify and reach the business.</summary>
    public string? Address { get; set; }
    public string? Phone { get; set; }

    /// <summary>Free-text line printed at the bottom of every receipt (thank-you
    /// note, return policy, etc.).</summary>
    public string? ReceiptFooter { get; set; }

    /// <summary>Company-wide default low-stock threshold prefilled on new
    /// products unless the product overrides it.</summary>
    public int DefaultLowStockThreshold { get; set; } = 0;

    /// <summary>False until the admin finishes the first-login setup wizard.
    /// Drives whether that guided flow is shown.</summary>
    public bool SetupCompleted { get; set; } = false;

    /// <summary>Unique onboarding code (Section 9) — the anti-duplicate mechanism.
    /// Other devices "join" a company by presenting this code rather than
    /// re-creating a company record, which eliminates duplicate risk by design.</summary>
    public string UniqueCode { get; set; } = string.Empty;

    public string Currency { get; set; } = "XAF";

    /// <summary>Section 18.3 — default VAT/TVA rate applied to a product unless
    /// it sets its own Product.TaxRateOverridePercent (e.g. Cameroon's ~19.25%
    /// standard TVA doesn't apply uniformly to every pharmaceutical product).</summary>
    public decimal DefaultTaxRatePercent { get; set; } = 19.25m;

    /// <summary>Cameroon tax regime. Standard (régime du réel) collects TVA per
    /// sale. FlatRate (impôt libératoire) is for very small businesses that pay a
    /// flat periodic lump-sum instead and charge NO TVA — so DefaultTaxRatePercent
    /// is set to 0 when this is chosen.</summary>
    public TaxRegime TaxRegime { get; set; } = TaxRegime.Standard;

    /// <summary>Which accounting framework this company's tax declaration follows
    /// (OHADA/SYSCOHADA by default; a generic VAT regime; or none). Lets non-OHADA
    /// businesses set up an applicable system without a code change.</summary>
    public AccountingSystem AccountingSystem { get; set; } = AccountingSystem.Ohada;

    // ── Inventory capabilities (chosen at setup) ────────────────────────────
    // Drive which UI each client shows, so a simple shop isn't burdened with
    // features it never uses. A business-type preset at onboarding sets these;
    // each is also individually toggleable in Company settings.

    /// <summary>Batches carry expiry dates; FEFO deducts by soonest expiry and the
    /// UI shows expiry fields + "expiring soon" warnings. Off = non-perishable
    /// goods (expiry UI hidden; deduction falls back to received-order). Default on.</summary>
    public bool ExpiryTrackingEnabled { get; set; } = true;

    /// <summary>Products can be sold by weight/length/volume (kg, m, L) — the POS
    /// shows a decimal quantity entry. For butchers, delis, fabric, produce.</summary>
    public bool SellByMeasureEnabled { get; set; } = false;

    /// <summary>Per-unit serial/IMEI + warranty tracking. For electronics and
    /// other high-value goods sold and serviced by individual unit.</summary>
    public bool SerialTrackingEnabled { get; set; } = false;

    /// <summary>Products have variants (e.g. size × colour). For fashion/footwear.</summary>
    public bool VariantsEnabled { get; set; } = false;

    /// <summary>Products can be assembled from components (bill of materials).
    /// For workshops/manufacturers/kits.</summary>
    public bool AssemblyEnabled { get; set; } = false;

    /// <summary>Flat lump-sum tax the business owes per FlatTaxPeriod under the
    /// impôt libératoire regime (assessed by their commune; entered manually).</summary>
    public decimal FlatTaxAmount { get; set; } = 0m;
    public FlatTaxPeriod FlatTaxPeriod { get; set; } = FlatTaxPeriod.Quarterly;

    /// <summary>The business's own taxpayer number (NIU), printed as the seller
    /// identifier on tax invoices.</summary>
    public string? TaxId { get; set; }

    /// <summary>Monotonic counter for sequential invoice numbers (a DGI
    /// requirement on tax invoices). Incremented as each sale is invoiced.</summary>
    public int NextInvoiceNumber { get; set; } = 1;

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

    /// <summary>Master toggle for the purchase-milestone reward program. When
    /// on, a customer earns one gift card each time their completed-purchase
    /// count crosses a multiple of RewardPurchaseCount. Distinct from loyalty
    /// points: this issues a physical, printable bearer gift card the customer
    /// carries back, rather than accruing redeemable points.</summary>
    public bool RewardProgramEnabled { get; set; } = false;

    /// <summary>Number of completed purchases a customer must make to earn one
    /// reward gift card (e.g. 10 = every 10th purchase).</summary>
    public int RewardPurchaseCount { get; set; } = 10;

    /// <summary>Fixed value of each reward gift card issued by the program.</summary>
    public decimal RewardGiftCardValue { get; set; } = 0m;

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
