namespace PharmaStock.Api.Services;

/// <summary>Names shared by the Claude connector (MCP) pieces: the OAuth server
/// (<see cref="McpOAuthEndpoints"/>), the token it issues
/// (<see cref="JwtTokenService.IssueMcpToken"/>) and the /mcp endpoint.</summary>
public static class McpConstants
{
    /// <summary>Audience of connector access tokens. Different from the app's
    /// "PharmaStock" audience on purpose: the two token kinds never cross over.</summary>
    public const string Audience = "PharmaStock.Mcp";

    /// <summary>Authentication scheme that validates connector access tokens on /mcp.</summary>
    public const string BearerScheme = "McpBearer";

    /// <summary>Authorization policy applied to /mcp.</summary>
    public const string Policy = "McpConnector";

    public const string GrantIdClaimType = "mcp_grant";

    /// <summary>The only scope in this first, read-only version.</summary>
    public const string ReadScope = "stockflow.read";

    public const string McpPath = "/mcp";

    /// <summary>Public base URL of the API as Claude sees it (https://api.mfspace.lu in
    /// production). Taken from Mcp:PublicBaseUrl when set, otherwise rebuilt from the
    /// request, honouring the reverse proxy's X-Forwarded-Proto/Host (Caddy sets them).</summary>
    public static string PublicBaseUrl(HttpContext http)
    {
        var configured = http.RequestServices.GetRequiredService<IConfiguration>()["Mcp:PublicBaseUrl"];
        if (!string.IsNullOrWhiteSpace(configured))
            return configured.TrimEnd('/');

        var proto = http.Request.Headers["X-Forwarded-Proto"].FirstOrDefault()?.Split(',')[0].Trim();
        var host = http.Request.Headers["X-Forwarded-Host"].FirstOrDefault()?.Split(',')[0].Trim();
        var scheme = string.IsNullOrWhiteSpace(proto) ? http.Request.Scheme : proto;
        var hostValue = string.IsNullOrWhiteSpace(host) ? http.Request.Host.Value : host;
        return $"{scheme}://{hostValue}";
    }
}
