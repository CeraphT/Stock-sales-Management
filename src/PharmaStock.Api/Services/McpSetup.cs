using System.Text;
using Microsoft.IdentityModel.Tokens;
using ModelContextProtocol.AspNetCore.Authentication;
using ModelContextProtocol.Authentication;

namespace PharmaStock.Api.Services;

/// <summary>Wires the read-only Claude connector (remote MCP server) into the API:
/// a dedicated bearer scheme that only accepts connector tokens, the MCP
/// protected-resource metadata + 401 challenge (so Claude discovers the OAuth server),
/// the stateless Streamable HTTP endpoint at /mcp, and the OAuth endpoints.
/// The app's own JWT scheme and endpoints are untouched.</summary>
public static class McpSetup
{
    public static void AddStockFlowMcp(this WebApplicationBuilder builder, string jwtSecret, string jwtIssuer)
    {
        builder.Services.AddHttpContextAccessor();

        builder.Services.AddAuthentication()
            .AddJwtBearer(McpConstants.BearerScheme, options =>
            {
                options.MapInboundClaims = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwtIssuer,
                    ValidateAudience = true,
                    ValidAudience = McpConstants.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                };
                // A missing/expired token gets the MCP challenge: 401 + WWW-Authenticate
                // pointing at the protected-resource metadata, which starts Claude's OAuth.
                options.ForwardChallenge = McpAuthenticationDefaults.AuthenticationScheme;
            })
            .AddMcp(options =>
            {
                options.Events.OnResourceMetadataRequest = ctx =>
                {
                    var b = McpConstants.PublicBaseUrl(ctx.HttpContext);
                    ctx.ResourceMetadata = new ProtectedResourceMetadata
                    {
                        Resource = b + McpConstants.McpPath,
                        AuthorizationServers = { b },
                        ScopesSupported = [McpConstants.ReadScope],
                        ResourceName = "StockFlow",
                        ResourceDocumentation = "https://guide.mfspace.lu/stockflow/",
                    };
                    return Task.CompletedTask;
                };
            });

        builder.Services.AddAuthorization(options =>
            options.AddPolicy(McpConstants.Policy, policy => policy
                .AddAuthenticationSchemes(McpConstants.BearerScheme)
                .RequireAuthenticatedUser()
                .RequireClaim(McpConstants.GrantIdClaimType)));

        builder.Services.AddMcpServer(options =>
            {
                options.ServerInfo = new() { Name = "StockFlow", Version = "1.0.0", Title = "StockFlow (read-only)" };
                options.ServerInstructions =
                    "StockFlow is a stock and sales system for small shops. This connection is READ-ONLY and limited to one shop. " +
                    "Call shop_info first to learn the shop's currency and branch names. Amounts are in that currency; quantities are " +
                    "in base units (the smallest unit sold). Dates are yyyy-MM-dd in UTC.";
            })
            .WithHttpTransport(options => options.Stateless = true)
            .WithTools<StockFlowMcpTools>();
    }

    public static void MapStockFlowMcp(this WebApplication app)
    {
        app.MapMcpOAuthEndpoints();
        app.MapMcp(McpConstants.McpPath).RequireAuthorization(McpConstants.Policy);
    }
}
