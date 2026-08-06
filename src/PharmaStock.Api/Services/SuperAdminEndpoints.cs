using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record SuperAdminCompanySummary(
    Guid Id, string Name, string UniqueCode, DateTime CreatedAt,
    int UserCount, int ProductCount, int SalesCount, decimal TotalRevenue);

public record SuperAdminCompanyUser(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record SuperAdminCompanyLocation(Guid Id, string Name, string? Address, bool Active);

public record SuperAdminCompanyDetail(
    Guid Id, string Name, string UniqueCode, DateTime CreatedAt,
    int UserCount, int ProductCount, int SalesCount, decimal TotalRevenue,
    List<SuperAdminCompanyUser> Users, List<SuperAdminCompanyLocation> Locations);

public record SuperAdminBootstrapRequest(string Name, string Phone, string Password);

/// <summary>The scoped session a SuperAdmin uses to operate inside one company.
/// <c>Token</c> carries that company's tenant claim; <c>LocationId</c>/<c>LocationName</c>
/// pre-select the company's default branch so the scoped app has an operating
/// location the moment it loads.</summary>
public record ImpersonateResponse(
    string Token, DateTime ExpiresAt, Guid CompanyId, string CompanyName,
    Guid? LocationId, string? LocationName);

public record SuperAdminAccountResponse(Guid Id, string Name, string Phone, bool Active);
public record CreateSuperAdminRequest(string Name, string Phone, string Password);
public record SetSuperAdminActiveRequest(bool Active);

public static class SuperAdminEndpoints
{
    public static void MapSuperAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/superadmin").RequireAuthorization("SuperAdminOnly");

        // Company oversight (v1 scope) — every registered company with cheap
        // aggregate stats. Company has no denormalized counters, so these are
        // EF projections/subqueries rather than loaded collections.
        group.MapGet("/companies", async (PharmaStockDbContext db) =>
        {
            var companies = await db.Companies
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new SuperAdminCompanySummary(
                    c.Id, c.Name, c.UniqueCode, c.CreatedAt,
                    db.Users.Count(u => u.CompanyId == c.Id),
                    db.Products.Count(p => p.CompanyId == c.Id),
                    db.Sales.Count(s => s.CompanyId == c.Id),
                    db.Sales.Where(s => s.CompanyId == c.Id).Sum(s => (decimal?)s.Total) ?? 0m))
                .ToListAsync();

            return Results.Ok(companies);
        });

        group.MapGet("/companies/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var company = await db.Companies.FindAsync(id);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var users = await db.Users.Where(u => u.CompanyId == id)
                .Select(u => new SuperAdminCompanyUser(u.Id, u.Name, u.Phone, u.Role, u.Active))
                .ToListAsync();
            var locations = await db.Locations.Where(l => l.CompanyId == id)
                .Select(l => new SuperAdminCompanyLocation(l.Id, l.Name, l.Address, l.Active))
                .ToListAsync();
            var productCount = await db.Products.CountAsync(p => p.CompanyId == id);
            var salesCount = await db.Sales.CountAsync(s => s.CompanyId == id);
            var totalRevenue = await db.Sales.Where(s => s.CompanyId == id).SumAsync(s => (decimal?)s.Total) ?? 0m;

            return Results.Ok(new SuperAdminCompanyDetail(
                company.Id, company.Name, company.UniqueCode, company.CreatedAt,
                users.Count, productCount, salesCount, totalRevenue, users, locations));
        });

        // Impersonation — mint a company-scoped session for the calling SuperAdmin
        // so they can view AND administer a tenant's data remotely through the
        // exact same company-scoped endpoints a normal admin uses. The returned
        // token keeps the SuperAdmin's own identity/role (audit-friendly) but
        // carries the target company_id claim; no refresh token is issued, so the
        // session is time-boxed (see JwtTokenService.IssueImpersonationToken).
        group.MapPost("/companies/{id:guid}/impersonate", async (Guid id, PharmaStockDbContext db, JwtTokenService tokens, HttpContext http, ILoggerFactory loggerFactory) =>
        {
            var company = await db.Companies.FindAsync(id);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var superAdminId = http.User.GetUserId();
            if (superAdminId is null)
                return Results.Unauthorized();
            var superAdminName = http.User.Identity?.Name ?? "SuperAdmin";

            // Default operating branch: the company's first active location (same
            // rule the normal login flow uses via resolveDefaultLocation).
            var location = await db.Locations
                .Where(l => l.CompanyId == id && l.Active)
                .OrderBy(l => l.Name)
                .FirstOrDefaultAsync();

            var (token, expiresAt) = tokens.IssueImpersonationToken(superAdminId.Value, superAdminName, id);

            // Audit: impersonation grants full cross-tenant reach, so leave a trail.
            loggerFactory.CreateLogger("SuperAdmin.Impersonation").LogWarning(
                "SuperAdmin {SuperAdminId} ({SuperAdminName}) started impersonating company {CompanyId} ({CompanyName})",
                superAdminId, superAdminName, id, company.Name);

            return Results.Ok(new ImpersonateResponse(
                token, expiresAt, company.Id, company.Name, location?.Id, location?.Name));
        });

        // Administer SuperAdmin access itself (who else can use this web app).
        // Distinct from the one-time /bootstrap endpoint below: these require
        // an existing SuperAdmin session (the group's RequireAuthorization),
        // so once the very first account exists, it's the one that grants
        // every subsequent one — no shared secret involved from here on.
        group.MapGet("/admins", async (PharmaStockDbContext db) =>
        {
            var admins = await db.Users.Where(u => u.Role == UserRole.SuperAdmin)
                .OrderBy(u => u.Name)
                .Select(u => new SuperAdminAccountResponse(u.Id, u.Name, u.Phone, u.Active))
                .ToListAsync();
            return Results.Ok(admins);
        });

        group.MapPost("/admins", async (CreateSuperAdminRequest request, PharmaStockDbContext db, IPasswordHasher<User> hasher) =>
        {
            if (string.IsNullOrWhiteSpace(request.Phone))
                return Results.BadRequest(new { message = "Le téléphone est requis." });
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { message = "Le mot de passe doit contenir au moins 6 caractères." });

            var user = new User
            {
                CompanyId = null,
                Name = request.Name,
                Phone = request.Phone,
                Role = UserRole.SuperAdmin,
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Created($"/api/superadmin/admins/{user.Id}",
                new SuperAdminAccountResponse(user.Id, user.Name, user.Phone, user.Active));
        });

        // Deactivate/reactivate rather than delete — mirrors how every other
        // user in this system is soft-disabled (User.Active), never removed.
        // Self-deactivation is blocked so a SuperAdmin can never lock
        // themselves out with no one else able to undo it.
        group.MapPut("/admins/{id:guid}/active", async (Guid id, SetSuperAdminActiveRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetUserId() == id && !request.Active)
                return Results.BadRequest(new { message = "Vous ne pouvez pas désactiver votre propre compte." });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.Role == UserRole.SuperAdmin);
            if (user is null)
                return Results.NotFound(new { message = "Compte SuperAdmin introuvable." });

            user.Active = request.Active;
            await db.SaveChangesAsync();
            return Results.Ok(new SuperAdminAccountResponse(user.Id, user.Name, user.Phone, user.Active));
        });

        // One-time-only bootstrap for the very first SuperAdmin account — there's
        // no other way to create one (every other user-creation path scopes to
        // a company). Gated on two independent conditions so it can't be replayed:
        // no SuperAdmin may already exist, AND the caller must know the shared
        // secret (same dev-only-fallback-secret pattern as Jwt:Secret).
        app.MapPost("/api/superadmin/bootstrap", async (
            SuperAdminBootstrapRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens, IConfiguration config, HttpContext http) =>
        {
            var expectedSecret = config["SuperAdmin:BootstrapSecret"]
                ?? "dev-only-insecure-bootstrap-secret-change-before-deploying";
            if (http.Request.Headers["X-Bootstrap-Secret"] != expectedSecret)
                return Results.Unauthorized();

            if (await db.Users.AnyAsync(u => u.Role == UserRole.SuperAdmin))
                return Results.Conflict(new { message = "Un compte SuperAdmin existe déjà." });

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { message = "Le mot de passe doit contenir au moins 6 caractères." });

            var user = new User
            {
                CompanyId = null,
                Name = request.Name,
                Phone = request.Phone,
                Role = UserRole.SuperAdmin,
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync();

            var auth = await AuthEndpoints.IssueAuthResponseAsync(
                user, Guid.NewGuid(), "Bootstrap", DevicePlatform.Web, db, tokens);
            return Results.Created($"/api/superadmin/companies", auth);
        });
    }
}
