using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>The OAuth parameters of one /authorize request, carried through the
/// sign-in and shop-picker steps.</summary>
public record McpAuthRequest(string ClientId, string RedirectUri, string CodeChallenge, string? State, string Scope);

/// <summary>A one-time authorization code waiting to be exchanged at /oauth/token.</summary>
public record McpAuthCode(string ClientId, string RedirectUri, string CodeChallenge, Guid UserId, Guid CompanyId, string Scope);

/// <summary>Between the password step and the shop picker: who signed in, for which request.</summary>
public record McpLoginTicket(Guid UserId, McpAuthRequest Request);

/// <summary>A small OAuth 2.1 authorization server for the Claude connector (MCP),
/// as Claude's custom connectors expect it: authorization server metadata (RFC 8414),
/// dynamic client registration (RFC 7591, public clients only), authorization code
/// with mandatory PKCE S256, and rotating refresh tokens. The person signs in with
/// their StockFlow phone + password and picks ONE shop; the resulting token is scoped
/// to that shop through the same company_id + role claims the apps use.</summary>
public static class McpOAuthEndpoints
{
    private static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan TicketLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(15);
    private const int MaxFailedLogins = 5;

    /// <summary>Claude's OAuth callbacks. Loopback redirects (any port) are also allowed,
    /// for desktop clients and the MCP Inspector. Extra ones: Mcp:AllowedRedirectUris
    /// (comma-separated).</summary>
    private static readonly string[] DefaultRedirectUris =
    [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
    ];

    public static void MapMcpOAuthEndpoints(this WebApplication app)
    {
        app.MapGet("/.well-known/oauth-authorization-server", (HttpContext http) =>
        {
            var b = McpConstants.PublicBaseUrl(http);
            return Results.Json(new
            {
                issuer = b,
                authorization_endpoint = $"{b}/oauth/authorize",
                token_endpoint = $"{b}/oauth/token",
                registration_endpoint = $"{b}/oauth/register",
                response_types_supported = new[] { "code" },
                grant_types_supported = new[] { "authorization_code", "refresh_token" },
                code_challenge_methods_supported = new[] { "S256" },
                token_endpoint_auth_methods_supported = new[] { "none" },
                scopes_supported = new[] { McpConstants.ReadScope },
            });
        });

        // RFC 7591 dynamic client registration. Public clients only: no secret is
        // issued, PKCE protects the code exchange instead.
        app.MapPost("/oauth/register", async (HttpContext http, PharmaStockDbContext db, IConfiguration config) =>
        {
            JsonElement body;
            try { body = await JsonSerializer.DeserializeAsync<JsonElement>(http.Request.Body); }
            catch (JsonException) { return OAuthError("invalid_client_metadata", "Body must be JSON."); }

            if (body.ValueKind != JsonValueKind.Object
                || !body.TryGetProperty("redirect_uris", out var urisEl) || urisEl.ValueKind != JsonValueKind.Array)
                return OAuthError("invalid_redirect_uri", "redirect_uris is required.");

            var uris = urisEl.EnumerateArray()
                .Where(u => u.ValueKind == JsonValueKind.String)
                .Select(u => u.GetString()!.Trim())
                .Distinct()
                .ToList();
            if (uris.Count is 0 or > 10)
                return OAuthError("invalid_redirect_uri", "Between 1 and 10 redirect_uris are required.");
            var refused = uris.FirstOrDefault(u => !IsAllowedRedirectUri(u, config));
            if (refused is not null)
                return OAuthError("invalid_redirect_uri", $"Redirect URI not allowed: {refused}");

            var name = body.TryGetProperty("client_name", out var n) && n.ValueKind == JsonValueKind.String
                ? n.GetString()!.Trim() : "";
            if (name.Length == 0) name = "Claude";
            if (name.Length > 100) name = name[..100];

            var client = new McpClient
            {
                ClientId = "sf_" + RandomToken(18),
                ClientName = name,
                RedirectUris = string.Join('\n', uris),
            };
            db.McpClients.Add(client);
            await db.SaveChangesAsync();

            return Results.Json(new
            {
                client_id = client.ClientId,
                client_id_issued_at = new DateTimeOffset(client.CreatedAt).ToUnixTimeSeconds(),
                client_name = client.ClientName,
                redirect_uris = uris,
                token_endpoint_auth_method = "none",
                grant_types = new[] { "authorization_code", "refresh_token" },
                response_types = new[] { "code" },
                scope = McpConstants.ReadScope,
            }, statusCode: StatusCodes.Status201Created);
        });

        app.MapGet("/oauth/authorize", async (HttpContext http, PharmaStockDbContext db) =>
        {
            var q = http.Request.Query;
            var fr = McpLoginPage.IsFrench(http, q["lang"]);
            var (request, client, problem) = await ValidateAuthRequestAsync(db,
                q["client_id"], q["redirect_uri"], q["response_type"], q["code_challenge"],
                q["code_challenge_method"], q["state"], q["scope"]);
            if (problem is not null) return problem(fr);

            return Html(McpLoginPage.Login(request!, client!.ClientName, fr, null, null));
        });

        app.MapPost("/oauth/authorize", async (
            HttpContext http, PharmaStockDbContext db, IPasswordHasher<User> hasher, IMemoryCache cache) =>
        {
            var f = await http.Request.ReadFormAsync();
            var fr = McpLoginPage.IsFrench(http, f["lang"]);
            var (request, client, problem) = await ValidateAuthRequestAsync(db,
                f["client_id"], f["redirect_uri"], f["response_type"], f["code_challenge"],
                f["code_challenge_method"], f["state"], f["scope"]);
            if (problem is not null) return problem(fr);

            if (f["decision"] == "deny")
                return RedirectWithError(request!, "access_denied");

            if (f["step"] == "shop")
            {
                var ticketKey = "mcp-ticket:" + f["ticket"];
                if (!cache.TryGetValue(ticketKey, out McpLoginTicket? ticket) || ticket is null || ticket.Request != request)
                    return Html(McpLoginPage.Login(request!, client!.ClientName, fr,
                        fr ? "La session a expiré. Reconnectez-vous." : "The session expired. Please sign in again.", null));
                if (!Guid.TryParse(f["company_id"], out var companyId))
                    return Html(McpLoginPage.Error(fr ? "Choisissez une boutique." : "Choose a shop.", fr));

                var membership = await ActiveMembershipAsync(db, ticket.UserId, companyId);
                if (membership is null)
                    return Html(McpLoginPage.Error(fr ? "Vous n'avez pas accès à cette boutique." : "You don't have access to this shop.", fr));

                cache.Remove(ticketKey);
                return IssueCodeAndRedirect(http, db, cache, request!, client!, membership);
            }

            // Step 1: phone + password.
            var phone = AuthEndpoints.NormalizePhone(f["phone"]);
            var password = f["password"].ToString();
            var failKey = "mcp-login-fail:" + phone;
            var fails = cache.Get<int?>(failKey) ?? 0;
            if (fails >= MaxFailedLogins)
                return Html(McpLoginPage.Login(request!, client!.ClientName, fr,
                    fr ? "Trop d'essais. Réessayez dans 15 minutes." : "Too many attempts. Try again in 15 minutes.", f["phone"]));

            var candidates = phone.Length == 0 ? [] : await db.Users
                .Where(u => u.Phone == phone && u.Active && u.Role != UserRole.SuperAdmin)
                .ToListAsync();
            var user = candidates.FirstOrDefault(u =>
                hasher.VerifyHashedPassword(u, u.PasswordHash, password) != PasswordVerificationResult.Failed);
            if (user is null)
            {
                cache.Set(failKey, fails + 1, LockoutWindow);
                return Html(McpLoginPage.Login(request!, client!.ClientName, fr,
                    fr ? "Numéro ou mot de passe incorrect." : "Wrong phone number or password.", f["phone"]));
            }
            cache.Remove(failKey);

            var memberships = await db.CompanyMemberships
                .Include(m => m.Company)
                .Where(m => m.UserId == user.Id && m.Status == MembershipStatus.Active && m.Company!.Active)
                .OrderBy(m => m.Company!.Name)
                .ToListAsync();
            if (memberships.Count == 0)
                return Html(McpLoginPage.Error(fr
                    ? "Ce compte n'a accès à aucune boutique active."
                    : "This account has no access to an active shop.", fr));

            if (memberships.Count == 1)
                return IssueCodeAndRedirect(http, db, cache, request!, client!, memberships[0]);

            var ticketId = RandomToken(24);
            cache.Set("mcp-ticket:" + ticketId, new McpLoginTicket(user.Id, request!), TicketLifetime);
            return Html(McpLoginPage.PickShop(request!, ticketId, client!.ClientName, user.Name,
                memberships.Select(m => (m.CompanyId, m.Company!.Name)).ToList(), fr));
        }).DisableAntiforgery();

        app.MapPost("/oauth/token", async (
            HttpContext http, PharmaStockDbContext db, JwtTokenService tokens, IMemoryCache cache, IConfiguration config) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!http.Request.HasFormContentType)
                return OAuthError("invalid_request", "Use application/x-www-form-urlencoded.");
            var f = await http.Request.ReadFormAsync();
            var clientId = f["client_id"].ToString();
            var grantType = f["grant_type"].ToString();

            if (grantType == "authorization_code")
            {
                var codeKey = "mcp-code:" + f["code"];
                if (!cache.TryGetValue(codeKey, out McpAuthCode? code) || code is null)
                    return OAuthError("invalid_grant", "Unknown or expired code.");
                cache.Remove(codeKey); // single use, even when the checks below fail

                if (code.ClientId != clientId || code.RedirectUri != f["redirect_uri"].ToString())
                    return OAuthError("invalid_grant", "client_id or redirect_uri does not match.");
                if (!PkceMatches(f["code_verifier"], code.CodeChallenge))
                    return OAuthError("invalid_grant", "PKCE verification failed.");

                var membership = await ActiveMembershipAsync(db, code.UserId, code.CompanyId);
                if (membership is null)
                    return OAuthError("invalid_grant", "Access to this shop is no longer active.");

                var (raw, hash, expiresAt) = NewRefreshToken(config);
                var grant = new McpGrant
                {
                    ClientId = clientId, UserId = code.UserId, CompanyId = code.CompanyId, Scope = code.Scope,
                    RefreshTokenHash = hash, RefreshTokenExpiresAt = expiresAt, LastUsedAt = DateTime.UtcNow,
                };
                db.McpGrants.Add(grant);
                var clientName = await db.McpClients.Where(c => c.ClientId == clientId).Select(c => c.ClientName).FirstOrDefaultAsync();
                db.AuditLogs.Add(new AuditLog
                {
                    ActorUserId = membership.UserId, ActorName = membership.User!.Name, Action = "mcp.connect",
                    TargetType = "company", TargetId = membership.CompanyId, CompanyId = membership.CompanyId,
                    Ip = http.GetClientIp(), Detail = $"{clientName ?? "Claude"} ({membership.Company!.Name})",
                });
                await db.SaveChangesAsync();
                return TokenResponse(tokens, membership, grant, raw);
            }

            if (grantType == "refresh_token")
            {
                var hash = JwtTokenService.HashRefreshToken(f["refresh_token"].ToString());
                var grant = await db.McpGrants.FirstOrDefaultAsync(g => g.RefreshTokenHash == hash);
                if (grant is null || grant.RevokedAt is not null || grant.RefreshTokenExpiresAt < DateTime.UtcNow
                    || grant.ClientId != clientId)
                    return OAuthError("invalid_grant", "Refresh token is invalid or expired.");

                var membership = await ActiveMembershipAsync(db, grant.UserId, grant.CompanyId);
                if (membership is null)
                {
                    grant.RevokedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync();
                    return OAuthError("invalid_grant", "Access to this shop is no longer active.");
                }

                // Rotate: the old refresh token stops working now.
                var (raw, newHash, expiresAt) = NewRefreshToken(config);
                grant.RefreshTokenHash = newHash;
                grant.RefreshTokenExpiresAt = expiresAt;
                grant.LastUsedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return TokenResponse(tokens, membership, grant, raw);
            }

            return OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
        }).DisableAntiforgery();
    }

    /// <summary>Validates an /authorize request. Client and redirect URI problems are
    /// shown on a page (never redirected, RFC 6749 §4.1.2.1); other problems are sent
    /// back to the client's redirect URI as an OAuth error.</summary>
    private static async Task<(McpAuthRequest? Request, McpClient? Client, Func<bool, IResult>? Problem)> ValidateAuthRequestAsync(
        PharmaStockDbContext db, string? clientId, string? redirectUri, string? responseType,
        string? codeChallenge, string? codeChallengeMethod, string? state, string? scope)
    {
        var client = string.IsNullOrEmpty(clientId) ? null
            : await db.McpClients.AsNoTracking().FirstOrDefaultAsync(c => c.ClientId == clientId);
        if (client is null)
            return (null, null, fr => Html(McpLoginPage.Error(fr
                ? "Cette application n'est pas enregistrée. Supprimez le connecteur dans Claude et ajoutez-le à nouveau."
                : "This application is not registered. Remove the connector in Claude and add it again.", fr), 400));
        if (string.IsNullOrEmpty(redirectUri) || !client.RedirectUris.Split('\n').Contains(redirectUri))
            return (null, null, fr => Html(McpLoginPage.Error(fr
                ? "Adresse de retour invalide."
                : "Invalid redirect address.", fr), 400));

        var request = new McpAuthRequest(client.ClientId, redirectUri, codeChallenge ?? "", state, McpConstants.ReadScope);
        if (responseType != "code")
            return (null, null, _ => RedirectWithError(request, "unsupported_response_type"));
        if (string.IsNullOrEmpty(codeChallenge) || codeChallengeMethod != "S256")
            return (null, null, _ => RedirectWithError(request, "invalid_request", "PKCE with S256 is required."));
        if (!string.IsNullOrWhiteSpace(scope)
            && scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(s => s != McpConstants.ReadScope))
            return (null, null, _ => RedirectWithError(request, "invalid_scope"));

        return (request, client, null);
    }

    /// <summary>Active membership of an active user in an active business, or null.
    /// Includes User and Company.</summary>
    public static Task<CompanyMembership?> ActiveMembershipAsync(PharmaStockDbContext db, Guid userId, Guid companyId) =>
        db.CompanyMemberships
            .Include(m => m.User)
            .Include(m => m.Company)
            .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == companyId
                && m.Status == MembershipStatus.Active && m.User!.Active
                && m.User.Role != UserRole.SuperAdmin && m.Company!.Active);

    private static IResult IssueCodeAndRedirect(HttpContext http, PharmaStockDbContext db, IMemoryCache cache,
        McpAuthRequest request, McpClient client, CompanyMembership membership)
    {
        var code = RandomToken(32);
        cache.Set("mcp-code:" + code,
            new McpAuthCode(request.ClientId, request.RedirectUri, request.CodeChallenge,
                membership.UserId, membership.CompanyId, request.Scope),
            CodeLifetime);
        return Results.Redirect(AppendQuery(request.RedirectUri,
            ("code", code), ("state", request.State), ("iss", McpConstants.PublicBaseUrl(http))));
    }

    private static IResult TokenResponse(JwtTokenService tokens, CompanyMembership membership, McpGrant grant, string refreshToken)
    {
        var (access, expiresAt) = tokens.IssueMcpToken(membership.User!, membership, grant.Id, grant.Scope);
        return Results.Json(new
        {
            access_token = access,
            token_type = "Bearer",
            expires_in = (int)Math.Max(0, (expiresAt - DateTime.UtcNow).TotalSeconds),
            refresh_token = refreshToken,
            scope = grant.Scope,
        });
    }

    private static (string Raw, string Hash, DateTime ExpiresAt) NewRefreshToken(IConfiguration config)
    {
        var days = config.GetValue<int?>("Mcp:RefreshTokenExpiryDays") ?? 30;
        var raw = RandomToken(32);
        return (raw, JwtTokenService.HashRefreshToken(raw), DateTime.UtcNow.AddDays(days));
    }

    private static bool PkceMatches(string? verifier, string challenge)
    {
        if (string.IsNullOrEmpty(verifier) || verifier.Length < 43 || verifier.Length > 128) return false;
        var computed = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(computed), Encoding.ASCII.GetBytes(challenge));
    }

    private static bool IsAllowedRedirectUri(string uri, IConfiguration config)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var u) || !string.IsNullOrEmpty(u.Fragment)) return false;
        if (u.Scheme == Uri.UriSchemeHttp && (u.Host == "localhost" || u.Host == "127.0.0.1" || u.Host == "[::1]"))
            return true;
        var extra = (config["Mcp:AllowedRedirectUris"] ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return DefaultRedirectUris.Concat(extra).Contains(uri, StringComparer.Ordinal);
    }

    private static IResult RedirectWithError(McpAuthRequest request, string error, string? description = null) =>
        Results.Redirect(AppendQuery(request.RedirectUri,
            ("error", error), ("error_description", description), ("state", request.State)));

    private static string AppendQuery(string uri, params (string Key, string? Value)[] values)
    {
        var parts = values.Where(v => !string.IsNullOrEmpty(v.Value))
            .Select(v => $"{Uri.EscapeDataString(v.Key)}={Uri.EscapeDataString(v.Value!)}");
        return uri + (uri.Contains('?') ? "&" : "?") + string.Join('&', parts);
    }

    private static IResult OAuthError(string error, string description) =>
        Results.Json(new { error, error_description = description }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult Html(string html, int status = 200) => new McpHtmlResult(html, status);

    private static string RandomToken(int bytes) => Base64Url(RandomNumberGenerator.GetBytes(bytes));

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
