namespace PharmaStock.Domain.Models;

/// <summary>An OAuth client registered for the Claude connector (MCP) through
/// dynamic client registration (RFC 7591). Public client: no secret, PKCE is
/// mandatory. Only redirect URIs on the server's allow-list are accepted.</summary>
public class McpClient
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The opaque client_id handed back to the registering client.</summary>
    public string ClientId { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;

    /// <summary>Registered redirect URIs, newline-separated (exact match at /authorize).</summary>
    public string RedirectUris { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
