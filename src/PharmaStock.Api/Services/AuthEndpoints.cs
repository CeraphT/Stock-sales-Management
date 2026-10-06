using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>AccountOnly = true (new apps): sign in to the account and let the person
/// pick a business on the "My shops" screen. Omitted (older app versions): open a
/// business straight away, as before memberships existed.</summary>
/// <summary>PreferShopAccount: the same phone can hold a SuperAdmin account and a shop
/// account; true skips the SuperAdmin one (the "My shops" choice after login).</summary>
public record LoginRequest(string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform, bool AccountOnly = false, bool PreferShopAccount = false);
public record RegisterRequest(string Name, string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record SelectCompanyRequest(Guid CompanyId, Guid DeviceId, string? DeviceName = null, DevicePlatform? Platform = null);
public record RefreshRequest(Guid DeviceId, string RefreshToken);
public record CreateStaffUserRequest(string Name, string Phone, string? Password, UserRole Role);
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
/// <summary>HasShopAccount (SuperAdmin logins only): the same phone + password also opens a
/// shop account, so the app offers "Super-admin console" or "My shops".</summary>
public record AuthResponse(string Token, DateTime ExpiresAt, string RefreshToken, Guid DeviceId, UserResponse User, Guid? CompanyId, bool HasShopAccount = false);

public static class AuthEndpoints
{
    /// <summary>Shown when a SuperAdmin has deactivated the user's business
    /// (Company.Active = false). French first: the product's primary market.</summary>
    public const string CompanyDeactivatedMessage =
        "Cette entreprise a été désactivée. Contactez le support StockFlow. / This business has been deactivated. Please contact StockFlow support.";

    public const string PasswordTooShortMessage = "Le mot de passe doit contenir au moins 6 caractères.";

    /// <summary>Phones are typed with spaces, dashes or dots ("6 61 59 56 48"); keep
    /// digits and a leading + so the same number always matches the same account.</summary>
    public static string NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
        var trimmed = phone.Trim();
        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        return trimmed.StartsWith('+') ? "+" + digits : digits;
    }

    private static IResult CompanyInactive() => Results.Json(
        new { message = CompanyDeactivatedMessage, code = "company_inactive" },
        statusCode: StatusCodes.Status403Forbidden);

    public static void MapAuthEndpoints(this WebApplication app)
    {
        // Section 3.7 — login by phone + password. A SuperAdmin account may share
        // its phone with the same person's shop account, so every active account
        // with that phone is checked (SuperAdmin first) instead of assuming one row.
        app.MapPost("/api/auth/login", async (
            LoginRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens, HttpContext http) =>
        {
            var phone = NormalizePhone(request.Phone);
            var candidates = await db.Users
                .Where(u => (u.Phone == phone || u.Phone == request.Phone) && u.Active)
                .Where(u => !request.PreferShopAccount || u.Role != UserRole.SuperAdmin)
                .OrderByDescending(u => u.Role == UserRole.SuperAdmin)
                .ToListAsync();

            foreach (var user in candidates)
            {
                if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
                    != PasswordVerificationResult.Success)
                    continue;

                if (user.Role == UserRole.SuperAdmin || request.AccountOnly)
                {
                    var auth = await IssueAuthResponseAsync(
                        user, null, request.DeviceId, request.DeviceName, request.Platform, db, tokens, http.GetClientIp());
                    // Same phone + same password also opens a shop account: let the app ask.
                    var hasShopAccount = user.Role == UserRole.SuperAdmin && candidates.Any(o =>
                        o.Role != UserRole.SuperAdmin
                        && hasher.VerifyHashedPassword(o, o.PasswordHash, request.Password) == PasswordVerificationResult.Success);
                    return Results.Ok(auth with { HasShopAccount = hasShopAccount });
                }

                // Older apps expect a business session from login: reopen the one this
                // device last used, else the first active business of the account.
                var memberships = await db.CompanyMemberships
                    .Include(m => m.Company)
                    .Where(m => m.UserId == user.Id && m.Status == MembershipStatus.Active)
                    .OrderBy(m => m.CreatedAt)
                    .ToListAsync();
                var lastCompanyId = await db.Devices.Where(d => d.Id == request.DeviceId).Select(d => d.CompanyId).FirstOrDefaultAsync();
                var membership = memberships.FirstOrDefault(m => m.CompanyId == lastCompanyId && m.Company!.Active)
                    ?? memberships.FirstOrDefault(m => m.Company!.Active);
                // Right password, but every business of this account is deactivated:
                // 403 + a clear message (not 401) so the app can say why.
                if (membership is null && memberships.Count > 0)
                    return CompanyInactive();

                return Results.Ok(await IssueAuthResponseAsync(
                    user, membership, request.DeviceId, request.DeviceName, request.Platform, db, tokens, http.GetClientIp()));
            }

            return Results.Unauthorized();
        });

        // Self sign-up: an account with no business yet. The person then creates a
        // business or asks to join one from the "My shops" screen.
        app.MapPost("/api/auth/register", async (
            RegisterRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens, HttpContext http) =>
        {
            var phone = NormalizePhone(request.Phone);
            if (string.IsNullOrWhiteSpace(request.Name) || phone.Length < 6)
                return Results.BadRequest(new { message = "Nom et numéro de téléphone requis." });
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { message = PasswordTooShortMessage });
            if (await db.Users.AnyAsync(u => u.Phone == phone && u.Role != UserRole.SuperAdmin))
                return Results.Conflict(new { message = "Ce numéro a déjà un compte. Connectez-vous.", code = "phone_taken" });

            var user = new User { Name = request.Name.Trim(), Phone = phone, Role = UserRole.Cashier };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Ok(await IssueAuthResponseAsync(
                user, null, request.DeviceId, request.DeviceName, request.Platform, db, tokens, http.GetClientIp()));
        });

        // Opens one of the caller's businesses: returns a business-scoped session
        // (same claims as a classic login) and remembers it on the device so a
        // token refresh, or the next start, stays in that business.
        app.MapPost("/api/auth/select-company", async (
            SelectCompanyRequest request, PharmaStockDbContext db, JwtTokenService tokens, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.Active);
            if (user is null) return Results.Unauthorized();
            if (user.Role == UserRole.SuperAdmin)
                return Results.BadRequest(new { message = "Un super-admin ouvre une entreprise depuis la console." });

            var membership = await db.CompanyMemberships.Include(m => m.Company)
                .FirstOrDefaultAsync(m => m.UserId == user.Id && m.CompanyId == request.CompanyId);
            if (membership is null || membership.Status != MembershipStatus.Active)
                return Results.Json(new
                {
                    message = membership?.Status == MembershipStatus.Pending
                        ? "Votre demande n'a pas encore été acceptée par le gérant."
                        : "Vous n'avez pas accès à cette boutique.",
                    code = membership?.Status == MembershipStatus.Pending ? "membership_pending" : "no_access",
                }, statusCode: StatusCodes.Status403Forbidden);
            if (!membership.Company!.Active) return CompanyInactive();

            var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == request.DeviceId);
            return Results.Ok(await IssueAuthResponseAsync(
                user, membership, request.DeviceId,
                request.DeviceName ?? device?.DeviceName ?? "Device",
                request.Platform ?? device?.Platform ?? DevicePlatform.Web,
                db, tokens, http.GetClientIp()));
        }).RequireAuthorization();

        // Section 21.1 — exchanges a still-valid refresh token for a new JWT
        // without re-prompting for phone+password, so a session survives past
        // the (deliberately short) JWT expiry. Rotates the refresh token on
        // every use: the old hash stops working the moment a new one is
        // issued, so a leaked-then-replayed old token is only ever usable once.
        // Stays in the business the device has open; if that access is gone
        // (removed, or business deactivated) the session ends (401).
        app.MapPost("/api/auth/refresh", async (
            RefreshRequest request, PharmaStockDbContext db, JwtTokenService tokens, HttpContext http) =>
        {
            var device = await db.Devices
                .Include(d => d.User)
                .FirstOrDefaultAsync(d => d.Id == request.DeviceId);

            // A remote wipe was requested for this device: tell it to erase its
            // local data (the client acts on this, then signs out). Returned even
            // though the refresh token was nulled — the deviceId alone identifies
            // it. Reversible: an admin Unblock clears RemoteWipeRequested.
            if (device is not null && device.RemoteWipeRequested)
                return Results.Ok(new { wipeRequested = true });

            if (device is null || device.User is null || !device.User.Active
                || device.IsRevoked || device.RemoteWipeRequested
                || device.RefreshTokenHash is null
                || device.RefreshTokenExpiresAt is null || device.RefreshTokenExpiresAt < DateTime.UtcNow
                || device.RefreshTokenHash != JwtTokenService.HashRefreshToken(request.RefreshToken))
            {
                return Results.Unauthorized();
            }

            CompanyMembership? membership = null;
            if (device.CompanyId is Guid companyId && device.User.Role != UserRole.SuperAdmin)
            {
                membership = await db.CompanyMemberships.Include(m => m.Company)
                    .FirstOrDefaultAsync(m => m.UserId == device.UserId && m.CompanyId == companyId);
                if (membership is null || membership.Status != MembershipStatus.Active || !membership.Company!.Active)
                    return Results.Unauthorized();
            }

            var auth = await IssueAuthResponseAsync(
                device.User, membership, device.Id, device.DeviceName, device.Platform, db, tokens, http.GetClientIp());
            return Results.Ok(auth);
        });

        // Section 3.7 — a CompanyAdmin adds a staff member by phone. If that phone
        // already has an account (the person works elsewhere too, or signed up
        // themselves) it is simply attached to this business and keeps its own
        // password; otherwise an account is created with the given password.
        app.MapPost("/api/companies/{companyId:guid}/users", async (
            Guid companyId, CreateStaffUserRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            if (!CanManage(http, companyId)) return Results.Forbid();
            if (request.Role == UserRole.SuperAdmin) return Results.BadRequest(new { message = "Rôle invalide." });

            var phone = NormalizePhone(request.Phone);
            if (phone.Length < 6) return Results.BadRequest(new { message = "Numéro de téléphone invalide." });
            if (!await db.Companies.AnyAsync(c => c.Id == companyId))
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == phone && u.Role != UserRole.SuperAdmin);
            if (user is null)
            {
                if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                    return Results.BadRequest(new { message = PasswordTooShortMessage });
                user = new User { Name = request.Name.Trim(), Phone = phone, Role = UserRole.Cashier };
                user.PasswordHash = hasher.HashPassword(user, request.Password);
                db.Users.Add(user);
            }

            var membership = await db.CompanyMemberships.FirstOrDefaultAsync(m => m.UserId == user.Id && m.CompanyId == companyId);
            if (membership is { Status: MembershipStatus.Active })
                return Results.Conflict(new { message = "Cette personne fait déjà partie de l'équipe." });
            if (membership is null)
            {
                membership = new CompanyMembership { UserId = user.Id, CompanyId = companyId };
                db.CompanyMemberships.Add(membership);
            }
            membership.Role = request.Role;
            membership.Status = MembershipStatus.Active;
            membership.DecidedAt = DateTime.UtcNow;
            membership.DecidedByUserId = http.User.GetUserId();

            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/users/{user.Id}", ToUserResponse(user, membership));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Staff/cashier management (Section 3.7) — a CompanyAdmin's roster
        // view of everyone (including other admins) in their own company.
        // Join requests waiting for approval are listed separately (MembershipEndpoints).
        app.MapGet("/api/companies/{companyId:guid}/users", async (
            Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!CanManage(http, companyId)) return Results.Forbid();

            var rows = await db.CompanyMemberships.Include(m => m.User)
                .Where(m => m.CompanyId == companyId
                    && (m.Status == MembershipStatus.Active || m.Status == MembershipStatus.Disabled))
                .OrderBy(m => m.User!.Name)
                .ToListAsync();

            return Results.Ok(rows.Select(m => ToUserResponse(m.User!, m)));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Deactivate/reactivate someone in THIS business only (their account and
        // their access to other businesses are untouched). Self-deactivation is
        // blocked so an admin can never lock themselves out.
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/active", async (
            Guid companyId, Guid userId, SetUserActiveRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!CanManage(http, companyId)) return Results.Forbid();

            if (http.User.GetUserId() == userId && !request.Active)
                return Results.BadRequest(new { message = "Vous ne pouvez pas désactiver votre propre compte." });

            var membership = await db.CompanyMemberships.Include(m => m.User)
                .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == companyId);
            if (membership is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            membership.Status = request.Active ? MembershipStatus.Active : MembershipStatus.Disabled;
            await db.SaveChangesAsync();

            return Results.Ok(ToUserResponse(membership.User!, membership));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Per-business feature restrictions — a CompanyAdmin locks a Cashier out of
        // specific management screens (Catalog/Purchasing/Customers/Reports).
        // Meaningless for Admin/SuperAdmin accounts, but not blocked here — the
        // client only ever shows this editor for Cashier rows, and every gated
        // endpoint checks the caller's own role first anyway.
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/permissions", async (
            Guid companyId, Guid userId, SetUserPermissionsRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!CanManage(http, companyId)) return Results.Forbid();

            var membership = await db.CompanyMemberships.Include(m => m.User)
                .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == companyId);
            if (membership is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            membership.RestrictCatalog = request.RestrictCatalog;
            membership.RestrictPurchasing = request.RestrictPurchasing;
            membership.RestrictCustomers = request.RestrictCustomers;
            membership.RestrictReportsAndFullSales = request.RestrictReportsAndFullSales;
            membership.RestrictCashRegister = request.RestrictCashRegister;
            membership.RestrictGiftCards = request.RestrictGiftCards;
            await db.SaveChangesAsync();

            return Results.Ok(ToUserResponse(membership.User!, membership));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Admin-driven password reset (a cashier forgot theirs). Only for an account
        // that works in THIS business alone: an account shared with other
        // businesses belongs to its owner, who changes the password themselves.
        app.MapPut("/api/companies/{companyId:guid}/users/{userId:guid}/password", async (
            Guid companyId, Guid userId, AdminResetPasswordRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            if (!CanManage(http, companyId)) return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                return Results.BadRequest(new { message = PasswordTooShortMessage });

            var membership = await db.CompanyMemberships.Include(m => m.User)
                .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == companyId);
            if (membership is null)
                return Results.NotFound(new { message = "Utilisateur introuvable." });

            var elsewhere = await db.CompanyMemberships.AnyAsync(m => m.UserId == userId && m.CompanyId != companyId
                && (m.Status == MembershipStatus.Active || m.Status == MembershipStatus.Disabled));
            if (elsewhere && !http.User.IsInRole(nameof(UserRole.SuperAdmin)))
                return Results.Conflict(new { message = "Ce compte est aussi utilisé dans une autre boutique : la personne doit changer son mot de passe elle-même." });

            var user = membership.User!;
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

    /// <summary>The caller administers <paramref name="companyId"/>: a SuperAdmin, or a
    /// CompanyAdmin whose business-scoped token is for that business (the role claim
    /// is the membership's role, see JwtTokenService.IssueToken).</summary>
    internal static bool CanManage(HttpContext http, Guid companyId) =>
        http.User.IsInRole(nameof(UserRole.SuperAdmin))
        || (http.User.IsInRole(nameof(UserRole.CompanyAdmin)) && http.User.GetCompanyId() == companyId);

    /// <summary>Upserts the Device row identified by deviceId (the client
    /// generates and persists this Guid once, on first run, and resends it on
    /// every login/refresh) and issues a fresh JWT + rotated refresh token.
    /// Shared by login, sign-up, business selection, refresh and business
    /// creation, so device bookkeeping (Section 21.1) never drifts between them.
    /// The device remembers the business it has open (Device.CompanyId).</summary>
    internal static async Task<AuthResponse> IssueAuthResponseAsync(
        User user, CompanyMembership? membership, Guid deviceId, string deviceName, DevicePlatform platform,
        PharmaStockDbContext db, JwtTokenService tokens, string? ip = null)
    {
        var (token, expiresAt) = tokens.IssueToken(user, membership, deviceId);
        var (rawRefreshToken, refreshHash, refreshExpiresAt) = tokens.IssueRefreshToken();

        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId);
        if (device is null)
        {
            device = new Device { Id = deviceId, UserId = user.Id, CreatedAt = DateTime.UtcNow };
            db.Devices.Add(device);
        }

        device.UserId = user.Id;
        device.CompanyId = membership?.CompanyId;
        device.Platform = platform;
        device.DeviceName = deviceName;
        device.LastActiveAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(ip)) device.LastIp = ip;
        device.RefreshTokenHash = refreshHash;
        device.RefreshTokenExpiresAt = refreshExpiresAt;

        await db.SaveChangesAsync();

        return new AuthResponse(
            token, expiresAt, rawRefreshToken, device.Id,
            ToUserResponse(user, membership),
            membership?.CompanyId);
    }

    /// <summary>The person as seen inside one business: role and restrictions come
    /// from the membership. Without one (account session, SuperAdmin) they are the
    /// account's platform role and no restrictions.</summary>
    internal static UserResponse ToUserResponse(User user, CompanyMembership? membership) => membership is null
        ? new(user.Id, user.Name, user.Phone, user.Role == UserRole.SuperAdmin ? UserRole.SuperAdmin : UserRole.Cashier,
            user.Active, false, false, false, false, false, false)
        : new(user.Id, user.Name, user.Phone, membership.Role,
            user.Active && membership.Status == MembershipStatus.Active,
            membership.RestrictCatalog, membership.RestrictPurchasing, membership.RestrictCustomers,
            membership.RestrictReportsAndFullSales, membership.RestrictCashRegister, membership.RestrictGiftCards);
}
