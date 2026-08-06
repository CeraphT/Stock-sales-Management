using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record LoginRequest(string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record RefreshRequest(Guid DeviceId, string RefreshToken);
public record CreateStaffUserRequest(string Name, string Phone, string Password, UserRole Role);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record SetUserActiveRequest(bool Active);
public record AdminResetPasswordRequest(string NewPassword);
public record SetUserPermissionsRequest(
    bool RestrictCatalog, bool RestrictPurchasing, bool RestrictCustomers, bool RestrictReportsAndFullSales,
    bool RestrictCashRegister, bool RestrictGiftCards);
public record UserResponse(
    Guid Id, string Name, string Phone, UserRole Role, bool Active,
    bool RestrictCatalog, bool RestrictPurchasing, bool RestrictCustomers, bool RestrictReportsAndFullSales,
    bool RestrictCashRegister, bool RestrictGiftCards);
public record AuthResponse(string Token, DateTime ExpiresAt, string RefreshToken, Guid DeviceId, UserResponse User, Guid? CompanyId);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        // Section 3.7 — login by phone + password. Phone is only unique per
        // company (UserConfiguration), so a phone shared across two companies'
        // staff is checked against every matching account rather than assumed
        // to resolve to a single row.
        app.MapPost("/api/auth/login", async (
            LoginRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens, HttpContext http) =>
        {
            var candidates = await db.Users
                .Where(u => u.Phone == request.Phone && u.Active)
                .ToListAsync();

            foreach (var user in candidates)
            {
                if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
                    == PasswordVerificationResult.Success)
                {
                    var auth = await IssueAuthResponseAsync(
                        user, request.DeviceId, request.DeviceName, request.Platform, db, tokens, http.GetClientIp());
                    return Results.Ok(auth);
                }
            }

            return Results.Unauthorized();
        });

        // Section 21.1 — exchanges a still-valid refresh token for a new JWT
        // without re-prompting for phone+password, so a session survives past
        // the (deliberately short) JWT expiry. Rotates the refresh token on
        // every use: the old hash stops working the moment a new one is
        // issued, so a leaked-then-replayed old token is only ever usable once.
        app.MapPost("/api/auth/refresh", async (
            RefreshRequest request, PharmaStockDbContext db, JwtTokenService tokens, HttpContext http) =>
        {
            var device = await db.Devices
                .Include(d => d.User)
                .FirstOrDefaultAsync(d => d.Id == request.DeviceId);

            if (device is null || device.User is null || !device.User.Active
                || device.IsRevoked || device.RemoteWipeRequested
                || device.RefreshTokenHash is null
                || device.RefreshTokenExpiresAt is null || device.RefreshTokenExpiresAt < DateTime.UtcNow
                || device.RefreshTokenHash != JwtTokenService.HashRefreshToken(request.RefreshToken))
            {
                return Results.Unauthorized();
            }

            var auth = await IssueAuthResponseAsync(
                device.User, device.Id, device.DeviceName, device.Platform, db, tokens, http.GetClientIp());
            return Results.Ok(auth);
        });

        // Section 3.7 — a CompanyAdmin adds staff accounts (cashiers, or a
        // second admin) after the company's own admin account already exists
        // (created alongside the company itself, see CompanyEndpoints). The
        // target company is always the caller's own — SuperAdmin aside, an
        // admin can never create a user in a company that is not theirs.
        app.MapPost("/api/companies/{companyId:guid}/users", async (
            Guid companyId, CreateStaffUserRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { message = "Le mot de passe doit contenir au moins 6 caractères." });

            var companyExists = await db.Companies.AnyAsync(c => c.Id == companyId);
            if (!companyExists)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var user = new User
            {
                CompanyId = companyId,
                Name = request.Name,
                Phone = request.Phone,
                Role = request.Role,
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);

            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/users/{user.Id}",
                ToUserResponse(user));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Staff/cashier management (Section 3.7) — a CompanyAdmin's roster
        // view of everyone (including other admins) in their own company.
        // Same tenant-isolation check as staff creation above.
        app.MapGet("/api/companies/{companyId:guid}/users", async (
            Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            var users = await db.Users.Where(u => u.CompanyId == companyId)
                .OrderBy(u => u.Name)
                .ToListAsync();

            return Results.Ok(users.Select(ToUserResponse));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Deactivate/reactivate a staff account — soft-disable only, same
        // pattern as every other Active flag in this system. Self-deactivation
        // is blocked (mirrors SuperAdminEndpoints' /admins/{id}/active guard)
        // so an admin can never lock themselves out with no one else able to
        // undo it.
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/active", async (
            Guid companyId, Guid userId, SetUserActiveRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            if (http.User.GetUserId() == userId && !request.Active)
                return Results.BadRequest(new { message = "Vous ne pouvez pas désactiver votre propre compte." });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.CompanyId == companyId);
            if (user is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            user.Active = request.Active;
            await db.SaveChangesAsync();

            return Results.Ok(ToUserResponse(user));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Per-user feature restrictions — a CompanyAdmin locks a Cashier out of
        // specific management screens (Catalog/Purchasing/Customers/Reports).
        // Meaningless for Admin/SuperAdmin accounts, but not blocked here — the
        // client only ever shows this editor for Cashier rows, and every gated
        // endpoint checks the caller's own role first anyway.
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/permissions", async (
            Guid companyId, Guid userId, SetUserPermissionsRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.CompanyId == companyId);
            if (user is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            user.RestrictCatalog = request.RestrictCatalog;
            user.RestrictPurchasing = request.RestrictPurchasing;
            user.RestrictCustomers = request.RestrictCustomers;
            user.RestrictReportsAndFullSales = request.RestrictReportsAndFullSales;
            user.RestrictCashRegister = request.RestrictCashRegister;
            user.RestrictGiftCards = request.RestrictGiftCards;
            await db.SaveChangesAsync();

            return Results.Ok(ToUserResponse(user));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Admin-driven password reset — unlike the self-service change-password
        // endpoint below, this skips the current-password check entirely
        // (an admin resetting a cashier's forgotten password doesn't know it).
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/password", async (
            Guid companyId, Guid userId, AdminResetPasswordRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                return Results.BadRequest(new { message = "Le mot de passe doit contenir au moins 6 caractères." });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.CompanyId == companyId);
            if (user is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
            await db.SaveChangesAsync();

            return Results.Ok();
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Any authenticated user (Cashier/CompanyAdmin/SuperAdmin) changes
        // their own password — requires knowing the current one, unlike the
        // CompanyAdmin-driven staff-creation path above which sets an
        // initial password with no prior secret to check.
        app.MapPost("/api/auth/change-password", async (
            ChangePasswordRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null)
                return Results.Unauthorized();

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user is null || !user.Active)
                return Results.Unauthorized();

            if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword)
                != PasswordVerificationResult.Success)
                return Results.BadRequest(new { message = "Current password is incorrect." });

            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                return Results.BadRequest(new { message = "New password must be at least 6 characters." });

            user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).RequireAuthorization();
    }

    /// <summary>Upserts the Device row identified by deviceId (the client
    /// generates and persists this Guid once, on first run, and resends it on
    /// every login/refresh) and issues a fresh JWT + rotated refresh token.
    /// Shared by login, refresh, and company creation — every path that
    /// starts or renews a session goes through here so device bookkeeping
    /// (Section 21.1) never drifts between them.</summary>
    internal static async Task<AuthResponse> IssueAuthResponseAsync(
        User user, Guid deviceId, string deviceName, DevicePlatform platform,
        PharmaStockDbContext db, JwtTokenService tokens, string? ip = null)
    {
        var (token, expiresAt) = tokens.IssueToken(user, deviceId);
        var (rawRefreshToken, refreshHash, refreshExpiresAt) = tokens.IssueRefreshToken();

        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId);
        if (device is null)
        {
            device = new Device { Id = deviceId, UserId = user.Id, CreatedAt = DateTime.UtcNow };
            db.Devices.Add(device);
        }

        device.UserId = user.Id;
        device.CompanyId = user.CompanyId;
        device.Platform = platform;
        device.DeviceName = deviceName;
        device.LastActiveAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(ip)) device.LastIp = ip;
        device.RefreshTokenHash = refreshHash;
        device.RefreshTokenExpiresAt = refreshExpiresAt;

        await db.SaveChangesAsync();

        return new AuthResponse(
            token, expiresAt, rawRefreshToken, device.Id,
            ToUserResponse(user),
            user.CompanyId);
    }

    internal static UserResponse ToUserResponse(User user) => new(
        user.Id, user.Name, user.Phone, user.Role, user.Active,
        user.RestrictCatalog, user.RestrictPurchasing, user.RestrictCustomers, user.RestrictReportsAndFullSales,
        user.RestrictCashRegister, user.RestrictGiftCards);
}
