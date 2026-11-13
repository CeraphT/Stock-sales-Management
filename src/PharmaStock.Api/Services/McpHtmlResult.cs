namespace PharmaStock.Api.Services;

/// <summary>Writes one of the connector sign-in pages with headers that keep it from
/// being framed (clickjacking), cached or loading anything external.</summary>
public class McpHtmlResult : IResult
{
    private readonly string _html;
    private readonly int _status;

    public McpHtmlResult(string html, int status)
    {
        _html = html;
        _status = status;
    }

    public async Task ExecuteAsync(HttpContext http)
    {
        http.Response.StatusCode = _status;
        http.Response.ContentType = "text/html; charset=utf-8";
        var h = http.Response.Headers;
        h.CacheControl = "no-store";
        h["X-Frame-Options"] = "DENY";
        h["X-Content-Type-Options"] = "nosniff";
        h["Referrer-Policy"] = "no-referrer";
        // No form-action here: browsers apply it to the redirect back to Claude.
        h.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";
        await http.Response.WriteAsync(_html);
    }
}
