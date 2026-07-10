using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record CreateLocationRequest(string Name, string? Address);
public record LocationResponse(Guid Id, string Name, string? Address, bool Active);

public static class LocationEndpoints
{
    public static void MapLocationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/locations").RequireAuthorization();

        // Section 16.6 — adding a branch beyond the default one created
        // alongside the company (see CompanyEndpoints).
        group.MapPost("/", async (Guid companyId, CreateLocationRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Name is required." });

            var location = new Location
            {
                CompanyId = companyId,
                Name = request.Name,
                Address = request.Address,
            };
            db.Locations.Add(location);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/locations/{location.Id}",
                new LocationResponse(location.Id, location.Name, location.Address, location.Active));
        });

        group.MapGet("/", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var locations = await db.Locations
                .Where(l => l.CompanyId == companyId)
                .Select(l => new LocationResponse(l.Id, l.Name, l.Address, l.Active))
                .ToListAsync();

            return Results.Ok(locations);
        });
    }
}
