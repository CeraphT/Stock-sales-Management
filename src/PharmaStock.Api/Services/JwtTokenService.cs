using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
