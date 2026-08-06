using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace PharmaStock.Api.Services;

public record GeoLocation(string? City, string? Country);

/// <summary>Best-effort, cached IP → city/country resolution for the monitoring
/// view. Uses the free ip-api.com endpoint (no key, ~45 req/min). Resolution is
/// deliberately non-authoritative and never allowed to throw into the caller:
/// on any failure (offline, rate-limited, private IP) it returns an empty
/// location so presence/heartbeat updates always succeed. Results are cached
/// in-memory per IP; callers also persist the resolved value on the Device row
/// so it survives restarts.</summary>
public class GeoIpService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IMemoryCache _cache;

    public GeoIpService(IHttpClientFactory httpFactory, IMemoryCache cache)
    {
        _httpFactory = httpFactory;
        _cache = cache;
    }

    public async Task<GeoLocation> ResolveAsync(string? ip, CancellationToken ct = default)
    {
        if (HttpContextExtensions.IsPrivateOrLoopback(ip)) return new GeoLocation(null, null);
        if (_cache.TryGetValue<GeoLocation>($"geo:{ip}", out var cached) && cached is not null) return cached;

        try
        {
            var client = _httpFactory.CreateClient("geoip");
            client.Timeout = TimeSpan.FromSeconds(3);
            using var resp = await client.GetAsync($"http://ip-api.com/json/{ip}?fields=status,country,city", ct);
            if (!resp.IsSuccessStatusCode) return new GeoLocation(null, null);

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;
            if (root.TryGetProperty("status", out var status) && status.GetString() == "success")
            {
                var city = root.TryGetProperty("city", out var c) ? c.GetString() : null;
                var country = root.TryGetProperty("country", out var co) ? co.GetString() : null;
                var loc = new GeoLocation(city, country);
                _cache.Set($"geo:{ip}", loc, TimeSpan.FromHours(12));
                return loc;
            }
        }
        catch
        {
            // Never let a monitoring nicety break the request path.
        }
        return new GeoLocation(null, null);
    }
}
