using System.Net;

namespace PharmaStock.Api.Services;

public static class HttpContextExtensions
{
    /// <summary>Best-effort client IP. Honours the first hop of X-Forwarded-For
    /// (set when the API sits behind a reverse proxy / load balancer) and falls
    /// back to the socket's remote address. Returns null if nothing usable.</summary>
    public static string? GetClientIp(this HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            if (!string.IsNullOrWhiteSpace(first)) return first;
        }
        return http.Connection.RemoteIpAddress?.ToString();
    }

    /// <summary>Loopback / private / link-local addresses can't be geo-resolved
    /// (and shouldn't be shipped to an external lookup) — the monitoring view
    /// just shows the raw IP for these.</summary>
    public static bool IsPrivateOrLoopback(string? ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return true;
        if (!IPAddress.TryParse(ip, out var addr)) return true;
        if (IPAddress.IsLoopback(addr)) return true;

        var b = addr.GetAddressBytes();
        if (addr.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && b.Length == 4)
        {
            if (b[0] == 10) return true;                       // 10.0.0.0/8
            if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true; // 172.16.0.0/12
            if (b[0] == 192 && b[1] == 168) return true;       // 192.168.0.0/16
            if (b[0] == 169 && b[1] == 254) return true;       // link-local
        }
        if (addr.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            if (addr.IsIPv6LinkLocal || addr.IsIPv6SiteLocal) return true;
            if (b.Length == 16 && (b[0] & 0xFE) == 0xFC) return true; // unique-local fc00::/7
        }
        return false;
    }
}
