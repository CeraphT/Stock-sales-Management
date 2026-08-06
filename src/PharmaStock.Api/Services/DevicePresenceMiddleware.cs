using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Runs on every authenticated request that carries a device_id claim.
/// Two jobs, both cheap:
///  1. Usage tracing — throttled (≤ once/60s per device) it refreshes the
///     device's LastActiveAt + LastIp (and lazily its geo), so ordinary traffic
///     (sync, dashboard, POS, …) keeps the fleet view's "live now" accurate
///     without the client having to ping explicitly.
///  2. Enforcement — a short-TTL cached check of the device/user block state so
///     blocking a device or deactivating a user takes effect within seconds,
///     not only when the 60-minute access token finally expires.
/// It fails OPEN: any DB/cache error lets the request through, so a monitoring
/// hiccup can never lock the whole fleet out.</summary>
public class DevicePresenceMiddleware
{
    private readonly RequestDelegate _next;

    // Enforcement freshness: a block/deactivate is felt within this window.
    private static readonly TimeSpan EnforceTtl = TimeSpan.FromSeconds(15);
    // Don't write a presence row more than once per minute per device.
    private static readonly TimeSpan TouchThrottle = TimeSpan.FromSeconds(60);

    public DevicePresenceMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    private record DevState(bool Exists, bool Blocked, bool Active);

    public async Task InvokeAsync(HttpContext ctx, IMemoryCache cache, IServiceScopeFactory scopeFactory, GeoIpService geo)
    {
        var deviceId = ctx.User?.Identity?.IsAuthenticated == true ? ctx.User.GetDeviceId() : null;
        if (deviceId is Guid dev)
        {
            var state = await GetStateAsync(cache, scopeFactory, dev);
            if (state.Exists && (state.Blocked || !state.Active))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.Headers["X-Session-Revoked"] = "1";
                await ctx.Response.WriteAsJsonAsync(new { message = "Session revoked. Please sign in again." });
                return;
            }

            if (!cache.TryGetValue($"touch:{dev}", out _))
            {
                cache.Set($"touch:{dev}", true, TouchThrottle);
                var ip = ctx.GetClientIp();
                // Fire-and-forget on its own scope — never block the response.
                _ = TouchAsync(scopeFactory, geo, dev, ip);
            }
        }

        await _next(ctx);
    }

    private static async Task<DevState> GetStateAsync(IMemoryCache cache, IServiceScopeFactory scopeFactory, Guid deviceId)
    {
        try
        {
            return await cache.GetOrCreateAsync($"devstate:{deviceId}", async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = EnforceTtl;
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<PharmaStockDbContext>();
                var row = await db.Devices
                    .Where(d => d.Id == deviceId)
                    .Select(d => new DevState(true, d.IsRevoked || d.RemoteWipeRequested, d.User!.Active))
                    .FirstOrDefaultAsync();
                return row ?? new DevState(false, false, true);
            }) ?? new DevState(false, false, true);
        }
        catch
        {
            return new DevState(false, false, true); // fail open
        }
    }

    private static async Task TouchAsync(IServiceScopeFactory scopeFactory, GeoIpService geo, Guid deviceId, string? ip)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PharmaStockDbContext>();
            var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId);
            if (device is null) return;

            device.LastActiveAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(ip)) device.LastIp = ip;

            // Resolve geo only when the IP changed (or was never resolved).
            if (!string.IsNullOrWhiteSpace(ip) && device.GeoResolvedForIp != ip)
            {
                var loc = await geo.ResolveAsync(ip);
                device.City = loc.City;
                device.Country = loc.Country;
                device.GeoResolvedForIp = ip;
            }
            await db.SaveChangesAsync();
        }
        catch
        {
            // best-effort telemetry
        }
    }
}
