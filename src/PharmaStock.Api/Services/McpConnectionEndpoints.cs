using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record McpConnectionResponse(
    Guid Id, string ClientName, Guid UserId, string UserName, bool IsMine,
    DateTime CreatedAt, DateTime? LastUsedAt, DateTime ExpiresAt);

/// <summary>The "Claude connections" screen: who connected Claude (the MCP connector)
/// to this business, and a button to cut a connection off. A manager (CompanyAdmin, or
/// an impersonating SuperAdmin) sees and can revoke every connection of the business;
/// anyone else only their own. Revoking takes effect at the connection's next tool
/// call (McpAccess re-checks the grant every time) and its refresh token stops working.
/// Called with the normal app token, not a connector token.</summary>
public static class McpConnectionEndpoints
{
    public static void MapMcpConnectionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/mcp-connections").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId) return Results.Forbid();
            var userId = http.User.GetUserId();
            var manager = IsManager(http);
            var now = DateTime.UtcNow;

            var grants = await db.McpGrants.AsNoTracking()
                .Where(g => g.CompanyId == companyId && g.RevokedAt == null && g.RefreshTokenExpiresAt > now)
                .Where(g => manager || g.UserId == userId)
                .OrderByDescending(g => g.LastUsedAt ?? g.CreatedAt)
                .Select(g => new { g.Id, g.ClientId, g.UserId, UserName = g.User!.Name, g.CreatedAt, g.LastUsedAt, g.RefreshTokenExpiresAt })
                .ToListAsync();

            var clientIds = grants.Select(g => g.ClientId).Distinct().ToList();
            var names = await db.McpClients.AsNoTracking()
                .Where(c => clientIds.Contains(c.ClientId))
                .ToDictionaryAsync(c => c.ClientId, c => c.ClientName);

            return Results.Ok(grants.Select(g => new McpConnectionResponse(
                g.Id, names.GetValueOrDefault(g.ClientId) ?? "Claude", g.UserId, g.UserName, g.UserId == userId,
                g.CreatedAt, g.LastUsedAt, g.RefreshTokenExpiresAt)));
        });

        group.MapPost("/{grantId:guid}/revoke", async (Guid companyId, Guid grantId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId) return Results.Forbid();
            var userId = http.User.GetUserId();

            var grant = await db.McpGrants.Include(g => g.User)
                .FirstOrDefaultAsync(g => g.Id == grantId && g.CompanyId == companyId);
            if (grant is null) return Results.NotFound(new { message = "Connexion introuvable." });
            if (!IsManager(http) && grant.UserId != userId) return Results.Forbid();

            if (grant.RevokedAt is null)
            {
                grant.RevokedAt = DateTime.UtcNow;
                db.AuditLogs.Add(new AuditLog
                {
                    ActorUserId = userId,
                    ActorName = http.User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "",
                    Action = "mcp.revoke", TargetType = "user", TargetId = grant.UserId, CompanyId = companyId,
                    Ip = http.GetClientIp(), Detail = grant.User?.Name,
                });
                await db.SaveChangesAsync();
            }
            return Results.NoContent();
        });
    }

    private static bool IsManager(HttpContext http) =>
        http.User.IsInRole(nameof(UserRole.CompanyAdmin)) || http.User.IsInRole(nameof(UserRole.SuperAdmin));
}
