using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record CreateCompanyRequest(
    string Name, string? Description, string Currency,
    string AdminName, string AdminPhone, string AdminPassword);
public record JoinCompanyRequest(string UniqueCode);
public record CompanyResponse(Guid Id, string Name, string UniqueCode, string Currency, bool ServicesModuleEnabled);
public record CreateCompanyResponse(CompanyResponse Company, AuthResponse Admin, LocationResponse DefaultLocation);

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
                return Results.BadRequest(new { message = "AdminPassword must be at least 6 characters." });

            var company = new Company
            {
                Name = request.Name,
                Description = request.Description,
                Currency = string.IsNullOrWhiteSpace(request.Currency) ? "XAF" : request.Currency,
                UniqueCode = GenerateUniqueCode()
            };
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

            var (token, expiresAt) = tokens.IssueToken(admin);

            return Results.Created($"/api/companies/{company.Id}", new CreateCompanyResponse(
                new CompanyResponse(company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled),
                new AuthResponse(token, expiresAt,
                    new UserResponse(admin.Id, admin.Name, admin.Phone, admin.Role, admin.Active),
                    company.Id),
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
                return Results.NotFound(new { message = "No company found with that code." });

            return Results.Ok(new CompanyResponse(
                company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled));
        });

        group.MapGet("/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var company = await db.Companies.FindAsync(id);
            return company is null
                ? Results.NotFound()
                : Results.Ok(new CompanyResponse(
                    company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled));
        });
    }

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
