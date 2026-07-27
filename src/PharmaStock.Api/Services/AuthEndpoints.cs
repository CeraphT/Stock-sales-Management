using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record LoginRequest(string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record RefreshRequest(Guid DeviceId, string RefreshToken);
public record CreateStaffUserRequest(string Name, string Phone, string Password, UserRole Role);
public record UserResponse(Guid Id, string Name, string Phone, UserRole Role, bool Active);
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
            IPasswordHasher<User> hasher, JwtTokenService tokens) =>
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
                        user, request.DeviceId, request.DeviceName, request.Platform, db, tokens);
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
            RefreshRequest request, PharmaStockDbContext db, JwtTokenService tokens) =>
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
                device.User, device.Id, device.DeviceName, device.Platform, db, tokens);
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
                new UserResponse(user.Id, user.Name, user.Phone, user.Role, user.Active));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }

    /// <summary>Upserts the Device row identified by deviceId (the client
    /// generates and persists this Guid once, on first run, and resends it on
    /// every login/refresh) and issues a fresh JWT + rotated refresh token.
    /// Shared by login, refresh, and company creation — every path that
    /// starts or renews a session goes through here so device bookkeeping
    /// (Section 21.1) never drifts between them.</summary>
    internal static async Task<AuthResponse> IssueAuthResponseAsync(
        User user, Guid deviceId, string deviceName, DevicePlatform platform,
        PharmaStockDbContext db, JwtTokenService tokens)
    {
        var (token, expiresAt) = tokens.IssueToken(user);
        var (rawRefreshToken, refreshHash, refreshExpiresAt) = tokens.IssueRefreshToken();

        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId);
        if (device is null)
        {
            device = new Device { Id = deviceId, UserId = user.Id };
            db.Devices.Add(device);
        }

        device.UserId = user.Id;
        device.CompanyId = user.CompanyId;
        device.Platform = platform;
        device.DeviceName = deviceName;
        device.LastActiveAt = DateTime.UtcNow;
        device.RefreshTokenHash = refreshHash;
        device.RefreshTokenExpiresAt = refreshExpiresAt;

        await db.SaveChangesAsync();

        return new AuthResponse(
            token, expiresAt, rawRefreshToken, device.Id,
            new UserResponse(user.Id, user.Name, user.Phone, user.Role, user.Active),
            user.CompanyId);
    }
}
