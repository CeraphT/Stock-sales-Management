namespace PharmaStock.Domain.Models;

/// <summary>One Claude connector connection: a person allowed an MCP client to read
/// ONE business. Holds the (hashed, rotating) refresh token. Access tokens carry this
/// row's id, so revoking the grant cuts the connector off at its next tool call.</summary>
public class McpGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string ClientId { get; set; } = string.Empty;

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Scope { get; set; } = string.Empty;

    /// <summary>SHA-256 hex of the current refresh token (the raw value is never stored).</summary>
    public string RefreshTokenHash { get; set; } = string.Empty;
    public DateTime RefreshTokenExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
}
