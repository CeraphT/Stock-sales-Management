using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>One business on the "My shops" screen. UniqueCode and PendingRequests are
/// only filled for an admin of that business (the code lets people ask to join).</summary>
public record MyCompanyResponse(
    Guid CompanyId, string Name, string? LogoUrl, string Currency, string? Address,
    UserRole Role, MembershipStatus Status, bool CompanyActive, int LocationCount,
    string? UniqueCode, int PendingRequests);
public record JoinByCodeRequest(string UniqueCode);
public record JoinByCodeResponse(Guid CompanyId, string CompanyName, MembershipStatus Status);
public record JoinRequestResponse(Guid MembershipId, Guid UserId, string Name, string Phone, DateTime CreatedAt);
public record ApproveJoinRequest(
    UserRole Role,
    bool RestrictCatalog = false, bool RestrictPurchasing = false, bool RestrictCustomers = false,
    bool RestrictReportsAndFullSales = false, bool RestrictCashRegister = false, bool RestrictGiftCards = false);

/// <summary>A person's businesses (the "My shops" screen) and the join-by-code flow:
/// the code only files a request; an admin of the business accepts it (choosing the
/// role and restrictions) or rejects it, so a leaked code never opens the till.</summary>
public static class MembershipEndpoints
{
    public static void MapMembershipEndpoints(this WebApplication app)
    {
        // Every business the caller belongs to or asked to join (rejected ones are
        // hidden). Works with an account session or a business session alike.
        app.MapGet("/api/me/companies", async (PharmaStockDbContext db, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            var rows = await db.CompanyMemberships
                .Where(m => m.UserId == userId && m.Status != MembershipStatus.Rejected)
                .OrderBy(m => m.Company!.Name)
                .Select(m => new
                {
                    m.CompanyId, m.Company!.Name, m.Company.LogoUrl, m.Company.Currency, m.Company.Address,
                    m.Role, m.Status, m.Company.Active, m.Company.UniqueCode,
                    Locations = db.Locations.Count(l => l.CompanyId == m.CompanyId && l.Active),
                    Pending = db.CompanyMemberships.Count(p => p.CompanyId == m.CompanyId && p.Status == MembershipStatus.Pending),
                })
                .ToListAsync();

            return Results.Ok(rows.Select(r =>
            {
                var admin = r.Role == UserRole.CompanyAdmin && r.Status == MembershipStatus.Active;
                return new MyCompanyResponse(
                    r.CompanyId, r.Name, r.LogoUrl, r.Currency, r.Address, r.Role, r.Status, r.Active,
                    r.Locations, admin ? r.UniqueCode : null, admin ? r.Pending : 0);
            }));
        }).RequireAuthorization();

        // Ask to join a business with its code (case and spaces don't matter). Files
        // a Pending membership; asking again after a rejection re-opens the request.
        app.MapPost("/api/me/join", async (JoinByCodeRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            if (http.User.IsInRole(nameof(UserRole.SuperAdmin)))
                return Results.BadRequest(new { message = "Un super-admin ouvre une entreprise depuis la console." });

            var code = new string((request.UniqueCode ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
            if (code.Length > 0 && !code.Contains('-') && code.Length > 4) code = code[..4] + "-" + code[4..];
            var company = await db.Companies.FirstOrDefaultAsync(c => c.UniqueCode == code);
            if (company is null)
                return Results.NotFound(new { message = "Aucune boutique trouvée avec ce code." });
            if (!company.Active)
                return Results.Json(new { message = AuthEndpoints.CompanyDeactivatedMessage, code = "company_inactive" },
                    statusCode: StatusCodes.Status403Forbidden);

            var membership = await db.CompanyMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == company.Id);
            if (membership is { Status: MembershipStatus.Active or MembershipStatus.Pending })
                return Results.Ok(new JoinByCodeResponse(company.Id, company.Name, membership.Status));
            if (membership is { Status: MembershipStatus.Disabled })
                return Results.Json(new { message = "Votre accès à cette boutique a été désactivé par le gérant." },
                    statusCode: StatusCodes.Status403Forbidden);

            if (membership is null)
            {
                membership = new CompanyMembership { UserId = userId.Value, CompanyId = company.Id };
                db.CompanyMemberships.Add(membership);
            }
            membership.Status = MembershipStatus.Pending;
            membership.Role = UserRole.Cashier;
            membership.CreatedAt = DateTime.UtcNow;
            membership.DecidedAt = null;
            membership.DecidedByUserId = null;

            var name = await db.Users.Where(u => u.Id == userId).Select(u => u.Name).FirstOrDefaultAsync();
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = userId, ActorName = name ?? "", Action = "membership.request",
                TargetType = "company", TargetId = company.Id, CompanyId = company.Id, Ip = http.GetClientIp(), Detail = company.Name,
            });
            await db.SaveChangesAsync();

            return Results.Ok(new JoinByCodeResponse(company.Id, company.Name, MembershipStatus.Pending));
        }).RequireAuthorization();

        // Join requests waiting in a business (admin of that business).
        app.MapGet("/api/companies/{companyId:guid}/join-requests", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!AuthEndpoints.CanManage(http, companyId)) return Results.Forbid();

            var rows = await db.CompanyMemberships
                .Where(m => m.CompanyId == companyId && m.Status == MembershipStatus.Pending)
                .OrderBy(m => m.CreatedAt)
                .Select(m => new JoinRequestResponse(m.Id, m.UserId, m.User!.Name, m.User.Phone, m.CreatedAt))
                .ToListAsync();
            return Results.Ok(rows);
        }).RequireAuthorization();

        app.MapPost("/api/companies/{companyId:guid}/join-requests/{membershipId:guid}/approve", async (
            Guid companyId, Guid membershipId, ApproveJoinRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!AuthEndpoints.CanManage(http, companyId)) return Results.Forbid();
            if (request.Role is not (UserRole.Cashier or UserRole.CompanyAdmin))
                return Results.BadRequest(new { message = "Rôle invalide." });

            var m = await db.CompanyMemberships.Include(x => x.User)
                .FirstOrDefaultAsync(x => x.Id == membershipId && x.CompanyId == companyId && x.Status == MembershipStatus.Pending);
            if (m is null) return Results.NotFound(new { message = "Demande introuvable." });

            m.Status = MembershipStatus.Active;
            m.Role = request.Role;
            m.RestrictCatalog = request.RestrictCatalog;
            m.RestrictPurchasing = request.RestrictPurchasing;
            m.RestrictCustomers = request.RestrictCustomers;
            m.RestrictReportsAndFullSales = request.RestrictReportsAndFullSales;
            m.RestrictCashRegister = request.RestrictCashRegister;
            m.RestrictGiftCards = request.RestrictGiftCards;
            m.DecidedAt = DateTime.UtcNow;
            m.DecidedByUserId = http.User.GetUserId();
            Audit(db, http, "membership.approve", m);
            await db.SaveChangesAsync();

            return Results.Ok(AuthEndpoints.ToUserResponse(m.User!, m));
        }).RequireAuthorization();

        app.MapPost("/api/companies/{companyId:guid}/join-requests/{membershipId:guid}/reject", async (
            Guid companyId, Guid membershipId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (!AuthEndpoints.CanManage(http, companyId)) return Results.Forbid();

            var m = await db.CompanyMemberships.Include(x => x.User)
                .FirstOrDefaultAsync(x => x.Id == membershipId && x.CompanyId == companyId && x.Status == MembershipStatus.Pending);
            if (m is null) return Results.NotFound(new { message = "Demande introuvable." });

            m.Status = MembershipStatus.Rejected;
            m.DecidedAt = DateTime.UtcNow;
            m.DecidedByUserId = http.User.GetUserId();
            Audit(db, http, "membership.reject", m);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).RequireAuthorization();
    }

    private static void Audit(PharmaStockDbContext db, HttpContext http, string action, CompanyMembership m) =>
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = http.User.GetUserId(),
            ActorName = http.User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "",
            Action = action, TargetType = "user", TargetId = m.UserId, CompanyId = m.CompanyId,
            Ip = http.GetClientIp(), Detail = m.User?.Name,
        });
}
