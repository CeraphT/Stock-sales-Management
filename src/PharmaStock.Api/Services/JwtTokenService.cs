using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using PharmaStock.Domain.Models;

namespace PharmaStock.Api.Services;

/// <summary>Issues access tokens for the JWT bearer scheme configured in
/// Program.cs. CompanyId is embedded as a custom claim so every downstream
/// endpoint can scope its queries without a second database round-trip.</summary>
public class JwtTokenService
{
    private readonly IConfiguration _configuration;

    public const string CompanyIdClaimType = "company_id";

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public (string Token, DateTime ExpiresAt) IssueToken(User user)
    {
        var secret = _configuration["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        var issuer = _configuration["Jwt:Issuer"] ?? "PharmaStock";
        var audience = _configuration["Jwt:Audience"] ?? "PharmaStock";
        var expiryMinutes = _configuration.GetValue<int?>("Jwt:ExpiryMinutes") ?? 60;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role.ToString()),
        };

        if (user.CompanyId.HasValue)
            claims.Add(new Claim(CompanyIdClaimType, user.CompanyId.Value.ToString()));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    /// <summary>Generates a new refresh token for a device. Returns the raw
    /// value (sent to the client once, never stored) alongside the hash that
    /// gets persisted on Device.RefreshTokenHash — mirrors how User.PasswordHash
    /// never stores the plaintext password.</summary>
    public (string RawToken, string Hash, DateTime ExpiresAt) IssueRefreshToken()
    {
        var days = _configuration.GetValue<int?>("Jwt:RefreshTokenExpiryDays") ?? 30;
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        return (raw, HashRefreshToken(raw), DateTime.UtcNow.AddDays(days));
    }

    public static string HashRefreshToken(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}

/// <summary>Small helpers for reading the claims JwtTokenService issues, so
/// endpoints don't repeat ClaimTypes/parsing boilerplate.</summary>
public static class ClaimsPrincipalExtensions
{
    public static Guid? GetCompanyId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(JwtTokenService.CompanyIdClaimType);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public static Guid? GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }
}
