using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
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

public record SuperAdminAccountResponse(Guid Id, string Name, string Phone, string? Email, bool Active);
public record CreateSuperAdminRequest(string Name, string Phone, string Password, string? Email);
public record SetSuperAdminActiveRequest(bool Active);

// ── Monitoring / fleet administration (Section 22.4) ────────────────────────
public record SuperAdminOverview(
    int TotalCompanies, int NewCompanies7d, int TotalUsers, int TotalDevices,
    int LiveDevices, int ActiveUsers24h, int ActiveUsers7d,
    int MobileActive7d, int DesktopActive7d, int WebActive7d);

public record SuperAdminDeviceRow(
    Guid Id, Guid? CompanyId, string? CompanyName, Guid UserId, string UserName,
    DevicePlatform Platform, string DeviceName, string? AppVersion,
    DateTime LastActiveAt, DateTime CreatedAt, string? LastIp, string? City, string? Country,
    bool IsRevoked, bool RemoteWipeRequested);

public record SuperAdminUserRow(
    Guid Id, Guid? CompanyId, string? CompanyName, string Name, string Phone,
    UserRole Role, bool Active, DateTime? LastActiveAt);

public record SetActiveRequest(bool Active);

public record AuditLogRow(
    Guid Id, Guid? ActorUserId, string ActorName, string Action,
    string? TargetType, Guid? TargetId, Guid? CompanyId, string? Ip, string? Detail, DateTime CreatedAt);

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
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = superAdminId, ActorName = superAdminName, Action = "impersonate.start",
                TargetType = "company", TargetId = id, CompanyId = id, Ip = http.GetClientIp(), Detail = company.Name,
            });
            await db.SaveChangesAsync();

            return Results.Ok(new ImpersonateResponse(
                token, expiresAt, company.Id, company.Name, location?.Id, location?.Name));
        });

        // ── Monitoring overview ─────────────────────────────────────────────
        group.MapGet("/overview", async (PharmaStockDbContext db) =>
        {
            var now = DateTime.UtcNow;
            var live = now.AddMinutes(-5);
            var day = now.AddHours(-24);
            var week = now.AddDays(-7);

            var platform7d = await db.Devices
                .Where(d => d.LastActiveAt >= week)
                .GroupBy(d => d.Platform)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToListAsync();
            int p(DevicePlatform pl) => platform7d.FirstOrDefault(x => x.Key == pl)?.Count ?? 0;

            return Results.Ok(new SuperAdminOverview(
                TotalCompanies: await db.Companies.CountAsync(),
                NewCompanies7d: await db.Companies.CountAsync(c => c.CreatedAt >= week),
                TotalUsers: await db.Users.CountAsync(u => u.Role != UserRole.SuperAdmin),
                TotalDevices: await db.Devices.CountAsync(),
                LiveDevices: await db.Devices.CountAsync(d => d.LastActiveAt >= live && !d.IsRevoked),
                ActiveUsers24h: await db.Devices.Where(d => d.LastActiveAt >= day).Select(d => d.UserId).Distinct().CountAsync(),
                ActiveUsers7d: await db.Devices.Where(d => d.LastActiveAt >= week).Select(d => d.UserId).Distinct().CountAsync(),
                MobileActive7d: p(DevicePlatform.Mobile),
                DesktopActive7d: p(DevicePlatform.Desktop),
                WebActive7d: p(DevicePlatform.Web)));
        });

        // ── Devices & sessions (cross-tenant, optional companyId filter) ─────
        group.MapGet("/devices", async (PharmaStockDbContext db, Guid? companyId) =>
        {
            var q = db.Devices.AsQueryable();
            if (companyId is Guid cid) q = q.Where(d => d.CompanyId == cid);
            var rows = await q
                .OrderByDescending(d => d.LastActiveAt)
                .Take(500)
                .Select(d => new SuperAdminDeviceRow(
                    d.Id, d.CompanyId,
                    db.Companies.Where(c => c.Id == d.CompanyId).Select(c => c.Name).FirstOrDefault(),
                    d.UserId, d.User!.Name, d.Platform, d.DeviceName, d.AppVersion,
                    d.LastActiveAt, d.CreatedAt, d.LastIp, d.City, d.Country, d.IsRevoked, d.RemoteWipeRequested))
                .ToListAsync();
            return Results.Ok(rows);
        });

        group.MapPost("/devices/{id:guid}/block", async (Guid id, PharmaStockDbContext db, HttpContext http, IMemoryCache cache) =>
            await SetDeviceBlockedAsync(id, blocked: true, wipe: false, db, http, cache));

        group.MapPost("/devices/{id:guid}/unblock", async (Guid id, PharmaStockDbContext db, HttpContext http, IMemoryCache cache) =>
            await SetDeviceBlockedAsync(id, blocked: false, wipe: false, db, http, cache));

        group.MapPost("/devices/{id:guid}/wipe", async (Guid id, PharmaStockDbContext db, HttpContext http, IMemoryCache cache) =>
            await SetDeviceBlockedAsync(id, blocked: true, wipe: true, db, http, cache));

        // ── Users (cross-tenant), block/unblock via User.Active ──────────────
        group.MapGet("/users", async (PharmaStockDbContext db, Guid? companyId) =>
        {
            var q = db.Users.Where(u => u.Role != UserRole.SuperAdmin);
            if (companyId is Guid cid) q = q.Where(u => u.CompanyId == cid);
            var rows = await q
                .OrderBy(u => u.Name)
                .Select(u => new SuperAdminUserRow(
                    u.Id, u.CompanyId,
                    db.Companies.Where(c => c.Id == u.CompanyId).Select(c => c.Name).FirstOrDefault(),
                    u.Name, u.Phone, u.Role, u.Active,
                    db.Devices.Where(d => d.UserId == u.Id).Max(d => (DateTime?)d.LastActiveAt)))
                .ToListAsync();
            return Results.Ok(rows);
        });

        group.MapPost("/users/{id:guid}/active", async (Guid id, SetActiveRequest request, PharmaStockDbContext db, HttpContext http, IMemoryCache cache) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.Role != UserRole.SuperAdmin);
            if (user is null) return Results.NotFound(new { message = "Utilisateur introuvable." });

            user.Active = request.Active;
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = http.User.GetUserId(), ActorName = http.User.Identity?.Name ?? "SuperAdmin",
                Action = request.Active ? "user.unblock" : "user.block", TargetType = "user", TargetId = id,
                CompanyId = user.CompanyId, Ip = http.GetClientIp(), Detail = user.Name,
            });
            await db.SaveChangesAsync();

            // Drop cached enforcement state for this user's devices so the change
            // is felt immediately rather than after the 15s TTL.
            var deviceIds = await db.Devices.Where(d => d.UserId == id).Select(d => d.Id).ToListAsync();
            foreach (var did in deviceIds) cache.Remove($"devstate:{did}");

            return Results.Ok(new { user.Id, user.Active });
        });

        // ── Audit trail ──────────────────────────────────────────────────────
        group.MapGet("/audit", async (PharmaStockDbContext db, int? take) =>
        {
            var rows = await db.AuditLogs
                .OrderByDescending(a => a.CreatedAt)
                .Take(Math.Clamp(take ?? 200, 1, 1000))
                .Select(a => new AuditLogRow(
                    a.Id, a.ActorUserId, a.ActorName, a.Action, a.TargetType, a.TargetId,
                    a.CompanyId, a.Ip, a.Detail, a.CreatedAt))
                .ToListAsync();
            return Results.Ok(rows);
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
                .Select(u => new SuperAdminAccountResponse(u.Id, u.Name, u.Phone, u.Email, u.Active))
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
                Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
                Role = UserRole.SuperAdmin,
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Created($"/api/superadmin/admins/{user.Id}",
                new SuperAdminAccountResponse(user.Id, user.Name, user.Phone, user.Email, user.Active));
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
            return Results.Ok(new SuperAdminAccountResponse(user.Id, user.Name, user.Phone, user.Email, user.Active));
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

    /// <summary>Block / unblock / remote-wipe a device, write the audit row, and
    /// evict the cached enforcement state so the change is felt within seconds.
    /// Blocking also nulls the refresh token so the session can't be renewed.</summary>
    private static async Task<IResult> SetDeviceBlockedAsync(
        Guid id, bool blocked, bool wipe, PharmaStockDbContext db, HttpContext http, IMemoryCache cache)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == id);
        if (device is null) return Results.NotFound(new { message = "Appareil introuvable." });

        device.IsRevoked = blocked;
        if (wipe) device.RemoteWipeRequested = true;
        if (!blocked) device.RemoteWipeRequested = false; // unblock clears any pending wipe
        if (blocked) device.RefreshTokenHash = null;       // kill the renewable session now

        var action = wipe ? "device.wipe" : (blocked ? "device.block" : "device.unblock");
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = http.User.GetUserId(), ActorName = http.User.Identity?.Name ?? "SuperAdmin",
            Action = action, TargetType = "device", TargetId = id, CompanyId = device.CompanyId,
            Ip = http.GetClientIp(), Detail = device.DeviceName,
        });
        await db.SaveChangesAsync();
        cache.Remove($"devstate:{id}");
        return Results.Ok(new { device.Id, device.IsRevoked, device.RemoteWipeRequested });
    }
}
