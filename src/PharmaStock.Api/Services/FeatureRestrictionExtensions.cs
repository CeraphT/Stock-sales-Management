using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Server-side enforcement for the per-business feature-restriction system
/// (CompanyMembership.RestrictCatalog/RestrictPurchasing/RestrictCustomers/
/// RestrictReportsAndFullSales — see AuthEndpoints' permissions endpoint,
/// which is how a CompanyAdmin sets these). This is defense-in-depth: the
/// clients also hide the relevant UI, but the server never trusts a
/// client-supplied "am I restricted" flag — every check here re-loads the
/// CALLER's membership in the token's business fresh from the DB.
/// CompanyAdmin/SuperAdmin callers are always exempt, since these flags only
/// ever restrict Cashiers.</summary>
public static class FeatureRestrictionExtensions
{
    /// <summary>Returns a 401/403 IResult if the caller is a restricted
    /// Cashier per <paramref name="isRestricted"/>, or null if the request
    /// may proceed. Mirrors the Forbid pattern already used throughout
    /// AuthEndpoints for other role checks.</summary>
    public static async Task<IResult?> CheckFeatureRestrictionAsync(
        this HttpContext http, PharmaStockDbContext db, Func<CompanyMembership, bool> isRestricted)
    {
        var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        if (callerRole == nameof(UserRole.SuperAdmin))
            return null;

        var caller = await http.GetCallerAsync(db);
        if (caller is null)
            return Results.Unauthorized();

        if (callerRole != nameof(UserRole.CompanyAdmin) && isRestricted(caller))
            return Results.Forbid();

        return null;
    }

    /// <summary>Loads the caller's membership in the token's business fresh from the
    /// DB (null if unauthenticated, removed, or no business in the token) — used by
    /// endpoints that auto-scope their results based on a restriction flag instead
    /// of outright blocking the request (e.g. the sales-history endpoint's
    /// RestrictReportsAndFullSales handling). A SuperAdmin (impersonating) has no
    /// membership and gets an unrestricted stand-in.</summary>
    public static async Task<CompanyMembership?> GetCallerAsync(this HttpContext http, PharmaStockDbContext db)
    {
        var callerUserId = http.User.GetUserId();
        var companyId = http.User.GetCompanyId();
        if (callerUserId is null || companyId is null)
            return null;

        if (http.User.IsInRole(nameof(UserRole.SuperAdmin)))
            return new CompanyMembership { UserId = callerUserId.Value, CompanyId = companyId.Value, Role = UserRole.CompanyAdmin };

        return await db.CompanyMemberships.AsNoTracking().FirstOrDefaultAsync(m =>
            m.UserId == callerUserId.Value && m.CompanyId == companyId.Value
            && m.Status == MembershipStatus.Active && m.User!.Active);
    }
}
