using ModelContextProtocol;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Access checks + audit for every Claude connector tool call. The token
/// says which person, business and grant; this re-checks all three fresh from the DB
/// on EVERY call (grant not revoked, membership active, user and business active), so
/// removing someone from a shop cuts their connector off immediately, not at token
/// expiry. Then it applies the same Restrict* flags the apps use (Cashier only) and
/// writes the call to the audit log, refused calls included.</summary>
public static class McpAccess
{
    public static async Task<CompanyMembership> BeginAsync(
        HttpContext? http, PharmaStockDbContext db, string tool, string? args,
        Func<CompanyMembership, bool>? isRestricted = null)
    {
        var user = http?.User;
        var userId = user?.GetUserId();
        var companyId = user?.GetCompanyId();
        var grantId = Guid.TryParse(user?.FindFirst(McpConstants.GrantIdClaimType)?.Value, out var g) ? g : (Guid?)null;
        if (http is null || userId is null || companyId is null || grantId is null)
            throw new McpException("Not signed in to StockFlow. Reconnect the StockFlow connector in Claude.");

        var grant = await db.McpGrants.FindAsync(grantId.Value);
        var membership = grant is null || grant.RevokedAt is not null || grant.UserId != userId || grant.CompanyId != companyId
            ? null
            : await McpOAuthEndpoints.ActiveMembershipAsync(db, userId.Value, companyId.Value);

        var refused = membership is null
            ? "no access"
            : membership.Role != UserRole.CompanyAdmin && isRestricted is not null && isRestricted(membership)
                ? "restricted"
                : null;

        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = userId,
            ActorName = membership?.User?.Name ?? user!.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "",
            Action = "mcp.tool." + tool,
            TargetType = "company",
            TargetId = companyId,
            CompanyId = companyId,
            Ip = http.GetClientIp(),
            Detail = Truncate(string.Join("; ", new[] { args, refused is null ? null : "refused: " + refused }
                .Where(s => !string.IsNullOrWhiteSpace(s))), 500),
        });
        if (grant is not null && membership is not null) grant.LastUsedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return refused switch
        {
            "no access" => throw new McpException(
                "This StockFlow connection no longer has access to the shop (access removed, account or shop deactivated, or connection revoked). Reconnect the connector in Claude."),
            "restricted" => throw new McpException(
                "Your manager has restricted this part of StockFlow for your account, so it is not available through Claude either."),
            _ => membership!,
        };
    }

    private static string? Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? null : s.Length <= max ? s : s[..max];
}
