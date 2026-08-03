using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Server-side enforcement for the per-user feature-restriction system
/// (User.RestrictCatalog/RestrictPurchasing/RestrictCustomers/
/// RestrictReportsAndFullSales — see AuthEndpoints' permissions endpoint,
/// which is how a CompanyAdmin sets these). This is defense-in-depth: the
/// mobile client also hides the relevant UI, but the server never trusts a
/// client-supplied "am I restricted" flag — every check here re-loads the
/// CALLER's own User row fresh from the DB via GetUserId(). CompanyAdmin/
/// SuperAdmin callers are always exempt, since these flags only ever
/// restrict Cashier accounts.</summary>
public static class FeatureRestrictionExtensions
{
    /// <summary>Returns a 401/403 IResult if the caller is a restricted
    /// Cashier per <paramref name="isRestricted"/>, or null if the request
    /// may proceed. Mirrors the Forbid pattern already used throughout
    /// AuthEndpoints for other role checks.</summary>
    public static async Task<IResult?> CheckFeatureRestrictionAsync(
        this HttpContext http, PharmaStockDbContext db, Func<User, bool> isRestricted)
    {
        var callerUserId = http.User.GetUserId();
        if (callerUserId is null)
            return Results.Unauthorized();

        var caller = await db.Users.FindAsync(callerUserId.Value);
        if (caller is null)
            return Results.Unauthorized();

        var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        if (callerRole != nameof(UserRole.CompanyAdmin) && callerRole != nameof(UserRole.SuperAdmin) && isRestricted(caller))
            return Results.Forbid();

        return null;
    }

    /// <summary>Loads the caller's own User row fresh from the DB (or null if
    /// unauthenticated/deleted) — used by endpoints that auto-scope their
    /// results based on a restriction flag instead of outright blocking the
    /// request (e.g. the sales-history endpoint's RestrictReportsAndFullSales
    /// handling).</summary>
    public static async Task<User?> GetCallerAsync(this HttpContext http, PharmaStockDbContext db)
    {
        var callerUserId = http.User.GetUserId();
        if (callerUserId is null)
            return null;

        return await db.Users.FindAsync(callerUserId.Value);
    }
}
