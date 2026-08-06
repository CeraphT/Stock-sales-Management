using Microsoft.EntityFrameworkCore;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record HeartbeatRequest(Guid DeviceId, string? AppVersion);

public static class DeviceEndpoints
{
    public static void MapDeviceEndpoints(this WebApplication app)
    {
        // Lightweight keep-alive an open app pings periodically so the fleet
        // view's "live now" stays accurate even while the app is idle (no other
        // requests firing). Ordinary traffic already refreshes presence via
        // DevicePresenceMiddleware; this covers the idle gap and reports the
        // running app version. Scoped to the caller's own device.
        app.MapPost("/api/devices/heartbeat", async (
            HeartbeatRequest request, PharmaStockDbContext db, HttpContext http, GeoIpService geo) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == request.DeviceId && d.UserId == userId);
            if (device is null) return Results.NotFound(new { message = "Device not found." });

            device.LastActiveAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(request.AppVersion)) device.AppVersion = request.AppVersion;

            var ip = http.GetClientIp();
            if (!string.IsNullOrWhiteSpace(ip))
            {
                device.LastIp = ip;
                if (device.GeoResolvedForIp != ip)
                {
                    var loc = await geo.ResolveAsync(ip);
                    device.City = loc.City;
                    device.Country = loc.Country;
                    device.GeoResolvedForIp = ip;
                }
            }

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();
    }
}
