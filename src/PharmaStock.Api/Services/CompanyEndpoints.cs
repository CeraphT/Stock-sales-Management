using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Which inventory features a company uses (chosen at setup, editable in
/// settings) — the clients gate their advanced UI on these.</summary>
public record InventoryCapabilities(
    bool ExpiryTracking, bool SellByMeasure, bool SerialTracking, bool Variants, bool Assembly);

public record CreateCompanyRequest(
    string Name, string? Description, string Currency,
    string AdminName, string AdminPhone, string AdminPassword,
    Guid DeviceId, string DeviceName, DevicePlatform Platform,
    InventoryCapabilities? Capabilities = null);
public record JoinCompanyRequest(string UniqueCode);
public record CompanyResponse(
    Guid Id, string Name, string UniqueCode, string Currency, bool ServicesModuleEnabled, string? Description, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue,
    bool RewardProgramEnabled, int RewardPurchaseCount, decimal RewardGiftCardValue,
    string? Address, string? Phone, string? ReceiptFooter, string? LogoUrl, int DefaultLowStockThreshold, bool SetupCompleted,
    TaxRegime TaxRegime, decimal FlatTaxAmount, FlatTaxPeriod FlatTaxPeriod, string? TaxId, AccountingSystem? AccountingSystem,
    InventoryCapabilities Capabilities);
public record CreateCompanyResponse(CompanyResponse Company, AuthResponse Admin, LocationResponse DefaultLocation);
public record UpdateCompanyRequest(
    string Name, string? Description, string Currency, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue,
    bool ServicesModuleEnabled,
    bool RewardProgramEnabled, int RewardPurchaseCount, decimal RewardGiftCardValue,
    string? Address, string? Phone, string? ReceiptFooter, string? LogoUrl, int DefaultLowStockThreshold, bool SetupCompleted,
    TaxRegime TaxRegime, decimal FlatTaxAmount, FlatTaxPeriod FlatTaxPeriod, string? TaxId, AccountingSystem? AccountingSystem,
    InventoryCapabilities? Capabilities = null);

public static class CompanyEndpoints
{
    public static void MapCompanyEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies");

        // Section 9 — "Create a new company" path of the onboarding flow.
        // Generates the unique code that every other device will use to "join"
        // this same company rather than accidentally creating a duplicate.
        // Creates the company's first CompanyAdmin account in the same
        // transaction — a company must never exist without an admin able to
        // log into it, so the two are never split across separate requests.
        group.MapPost("/", async (
            CreateCompanyRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens) =>
        {
            if (string.IsNullOrWhiteSpace(request.AdminPassword) || request.AdminPassword.Length < 6)
                return Results.BadRequest(new { message = "Le mot de passe administrateur doit contenir au moins 6 caractères." });

            var company = new Company
            {
                Name = request.Name,
                Description = request.Description,
                Currency = string.IsNullOrWhiteSpace(request.Currency) ? "XAF" : request.Currency,
                UniqueCode = GenerateUniqueCode()
            };
            // Inventory capabilities chosen at setup (the business-type preset).
            // Omitted → keep the model defaults (expiry on, everything else off).
            if (request.Capabilities is { } caps)
            {
                company.ExpiryTrackingEnabled = caps.ExpiryTracking;
                company.SellByMeasureEnabled = caps.SellByMeasure;
                company.SerialTrackingEnabled = caps.SerialTracking;
                company.VariantsEnabled = caps.Variants;
                company.AssemblyEnabled = caps.Assembly;
            }
            db.Companies.Add(company);

            var admin = new User
            {
                CompanyId = company.Id,
                Name = request.AdminName,
                Phone = request.AdminPhone,
                Role = UserRole.CompanyAdmin,
            };
            admin.PasswordHash = hasher.HashPassword(admin, request.AdminPassword);
            db.Users.Add(admin);

            // Section 16.6 — every company starts with one Location so
            // single-shop usage (the common case) needs no extra setup before
            // stock can be received or a sale rung up; more branches can be
            // added later via POST .../locations.
            var defaultLocation = new Location
            {
                CompanyId = company.Id,
                Name = "Main",
            };
            db.Locations.Add(defaultLocation);

            await db.SaveChangesAsync();

            var auth = await AuthEndpoints.IssueAuthResponseAsync(
                admin, request.DeviceId, request.DeviceName, request.Platform, db, tokens);

            return Results.Created($"/api/companies/{company.Id}", new CreateCompanyResponse(
                ToResponse(company),
                auth,
                new LocationResponse(defaultLocation.Id, defaultLocation.Name, defaultLocation.Address, defaultLocation.Active)));
        });

        // Section 9 — "Join an existing company" path. A device (Desktop,
        // Mobile, or Web) presents the code instead of re-creating the
        // company, which is what eliminates the duplicate-company problem
        // by construction rather than by fuzzy name-matching.
        group.MapPost("/join", async (JoinCompanyRequest request, PharmaStockDbContext db) =>
        {
            var company = await db.Companies
                .FirstOrDefaultAsync(c => c.UniqueCode == request.UniqueCode);

            if (company is null)
                return Results.NotFound(new { message = "Aucune entreprise trouvée avec ce code." });

            return Results.Ok(ToResponse(company));
        });

        group.MapGet("/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var company = await db.Companies.FindAsync(id);
            return company is null ? Results.NotFound() : Results.Ok(ToResponse(company));
        });

        // "Gérer mon entreprise" — a CompanyAdmin editing their own company's
        // own details post-onboarding (name, description, currency, default
        // tax rate). Deliberately not a cross-tenant admin surface: scoped to
        // the caller's own CompanyId only, via the same role check already
        // used for staff-account creation. Cross-tenant company management
        // (Super Admin) is out of scope here — see project decision to build
        // that as a separate web app instead.
        group.MapPut("/{id:guid}", async (Guid id, UpdateCompanyRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != id)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom de l'entreprise est requis." });
            if (request.LoyaltyEarnRateAmount <= 0 || request.LoyaltyPointValue <= 0)
                return Results.BadRequest(new { message = "Les paramètres de fidélité doivent être des montants positifs." });

            var company = await db.Companies.FindAsync(id);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            company.Name = request.Name.Trim();
            company.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
            company.Currency = string.IsNullOrWhiteSpace(request.Currency) ? company.Currency : request.Currency.Trim();
            company.DefaultTaxRatePercent = request.DefaultTaxRatePercent;
            company.LoyaltyEnabled = request.LoyaltyEnabled;
            company.LoyaltyEarnRateAmount = request.LoyaltyEarnRateAmount;
            company.LoyaltyPointValue = request.LoyaltyPointValue;
            company.ServicesModuleEnabled = request.ServicesModuleEnabled;
            company.RewardProgramEnabled = request.RewardProgramEnabled;
            company.RewardPurchaseCount = request.RewardPurchaseCount > 0 ? request.RewardPurchaseCount : company.RewardPurchaseCount;
            company.RewardGiftCardValue = request.RewardGiftCardValue >= 0 ? request.RewardGiftCardValue : company.RewardGiftCardValue;
            company.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
            company.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            company.ReceiptFooter = string.IsNullOrWhiteSpace(request.ReceiptFooter) ? null : request.ReceiptFooter.Trim();
            company.LogoUrl = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl;
            company.DefaultLowStockThreshold = request.DefaultLowStockThreshold >= 0 ? request.DefaultLowStockThreshold : company.DefaultLowStockThreshold;
            company.SetupCompleted = request.SetupCompleted;
            company.TaxRegime = request.TaxRegime;
            company.FlatTaxAmount = request.FlatTaxAmount >= 0 ? request.FlatTaxAmount : company.FlatTaxAmount;
            company.FlatTaxPeriod = request.FlatTaxPeriod;
            company.TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim();
            if (request.AccountingSystem.HasValue) company.AccountingSystem = request.AccountingSystem.Value;
            if (request.Capabilities is { } caps)
            {
                company.ExpiryTrackingEnabled = caps.ExpiryTracking;
                company.SellByMeasureEnabled = caps.SellByMeasure;
                company.SerialTrackingEnabled = caps.SerialTracking;
                company.VariantsEnabled = caps.Variants;
                company.AssemblyEnabled = caps.Assembly;
            }

            await db.SaveChangesAsync();

            return Results.Ok(ToResponse(company));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }

    private static CompanyResponse ToResponse(Company company) => new(
        company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled,
        company.Description, company.DefaultTaxRatePercent,
        company.LoyaltyEnabled, company.LoyaltyEarnRateAmount, company.LoyaltyPointValue,
        company.RewardProgramEnabled, company.RewardPurchaseCount, company.RewardGiftCardValue,
        company.Address, company.Phone, company.ReceiptFooter, company.LogoUrl, company.DefaultLowStockThreshold, company.SetupCompleted,
        company.TaxRegime, company.FlatTaxAmount, company.FlatTaxPeriod, company.TaxId, company.AccountingSystem,
        new InventoryCapabilities(
            company.ExpiryTrackingEnabled, company.SellByMeasureEnabled, company.SerialTrackingEnabled,
            company.VariantsEnabled, company.AssemblyEnabled));

    /// <summary>Short, human-typeable code (Section 9): e.g. PHRM-7X2K9.
    /// Collision odds are negligible at this scale, but the database-level
    /// unique index (CompanyConfiguration) is the real guarantee, not this.</summary>
    private static string GenerateUniqueCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
        var random = Random.Shared;
        var suffix = new string(Enumerable.Range(0, 5).Select(_ => chars[random.Next(chars.Length)]).ToArray());
        return $"PHRM-{suffix}";
    }
}
