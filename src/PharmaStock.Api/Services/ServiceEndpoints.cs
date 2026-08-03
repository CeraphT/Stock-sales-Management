using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record ServiceStockLinkRequest(Guid ProductId, int QuantityConsumedInBaseUnits);
public record ServiceStockLinkResponse(Guid ProductId, string ProductName, int QuantityConsumedInBaseUnits);

// Reused for both create and update bodies — same shape either way, mirrors
// SupplierRequest/SupplierEndpoints reusing one record across POST and PUT.
public record ServiceRequest(string Name, decimal FixedPrice, string? Category, List<ServiceStockLinkRequest>? StockLinks);

public record SetServiceActiveRequest(bool Active);

public record ServiceResponse(
    Guid Id, string Name, decimal FixedPrice, string? Category, bool Active,
    List<ServiceStockLinkResponse> StockLinks);

/// <summary>Section 20 — CRUD for the Optional Additional Services Module's
/// fixed-price service catalog (e.g. "Consultation prénatale"). Read access
/// (list) is open to any authenticated staff member, same split as most other
/// resource endpoints in this codebase (e.g. SupplierEndpoints); mutation is
/// restricted to CompanyAdmin/SuperAdmin.</summary>
public static class ServiceEndpoints
{
    public static void MapServiceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/services").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var services = await db.Services
                .Include(s => s.StockLinks).ThenInclude(l => l.Product)
                .Where(s => s.CompanyId == companyId)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return Results.Ok(services.Select(ToResponse));
        });

        group.MapPost("/", async (Guid companyId, ServiceRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du service est requis." });
            if (request.FixedPrice < 0)
                return Results.BadRequest(new { message = "Le prix du service ne peut pas être négatif." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });
            if (!company.ServicesModuleEnabled)
                return Results.BadRequest(new { message = "Le module Services n'est pas activé pour cette entreprise." });

            var service = new Service
            {
                CompanyId = companyId,
                Name = request.Name.Trim(),
                FixedPrice = request.FixedPrice,
                Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
            };

            if (request.StockLinks is { Count: > 0 })
            {
                var error = await ValidateStockLinksAsync(request.StockLinks, companyId, db);
                if (error is not null)
                    return error;

                foreach (var link in request.StockLinks)
                {
                    service.StockLinks.Add(new ServiceStockLink
                    {
                        ProductId = link.ProductId,
                        QuantityConsumedInBaseUnits = link.QuantityConsumedInBaseUnits,
                    });
                }
            }

            db.Services.Add(service);
            await db.SaveChangesAsync();

            var created = await db.Services
                .Include(s => s.StockLinks).ThenInclude(l => l.Product)
                .FirstAsync(s => s.Id == service.Id);

            return Results.Created($"/api/companies/{companyId}/services/{service.Id}", ToResponse(created));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        group.MapPut("/{serviceId:guid}", async (
            Guid companyId, Guid serviceId, ServiceRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du service est requis." });
            if (request.FixedPrice < 0)
                return Results.BadRequest(new { message = "Le prix du service ne peut pas être négatif." });

            var service = await db.Services
                .Include(s => s.StockLinks)
                .FirstOrDefaultAsync(s => s.Id == serviceId && s.CompanyId == companyId);
            if (service is null)
                return Results.NotFound(new { message = "Service introuvable." });

            if (request.StockLinks is { Count: > 0 })
            {
                var error = await ValidateStockLinksAsync(request.StockLinks, companyId, db);
                if (error is not null)
                    return error;
            }

            service.Name = request.Name.Trim();
            service.FixedPrice = request.FixedPrice;
            service.Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim();

            // Replace the whole child collection wholesale — simplest correct
            // approach for a small, unordered list like this (no per-row diffing).
            db.ServiceStockLinks.RemoveRange(service.StockLinks);
            service.StockLinks.Clear();
            if (request.StockLinks is { Count: > 0 })
            {
                foreach (var link in request.StockLinks)
                {
                    service.StockLinks.Add(new ServiceStockLink
                    {
                        ServiceId = service.Id,
                        ProductId = link.ProductId,
                        QuantityConsumedInBaseUnits = link.QuantityConsumedInBaseUnits,
                    });
                }
            }

            await db.SaveChangesAsync();

            var updated = await db.Services
                .Include(s => s.StockLinks).ThenInclude(l => l.Product)
                .FirstAsync(s => s.Id == service.Id);

            return Results.Ok(ToResponse(updated));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Deactivate/reactivate rather than delete — preserves historical
        // sales (ServiceLine references) if a service is discontinued
        // (Section 20.4), same soft-disable pattern as everywhere else.
        group.MapPut("/{serviceId:guid}/active", async (
            Guid companyId, Guid serviceId, SetServiceActiveRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var restricted = await http.CheckFeatureRestrictionAsync(db, u => u.RestrictCatalog);
            if (restricted is not null) return restricted;

            var service = await db.Services
                .Include(s => s.StockLinks).ThenInclude(l => l.Product)
                .FirstOrDefaultAsync(s => s.Id == serviceId && s.CompanyId == companyId);
            if (service is null)
                return Results.NotFound(new { message = "Service introuvable." });

            service.Active = request.Active;
            await db.SaveChangesAsync();

            return Results.Ok(ToResponse(service));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }

    private static async Task<IResult?> ValidateStockLinksAsync(
        List<ServiceStockLinkRequest> links, Guid companyId, PharmaStockDbContext db)
    {
        if (links.Any(l => l.QuantityConsumedInBaseUnits <= 0))
            return Results.BadRequest(new { message = "Les quantités consommées doivent être positives." });

        var productIds = links.Select(l => l.ProductId).Distinct().ToList();
        var validCount = await db.Products.CountAsync(p => productIds.Contains(p.Id) && p.CompanyId == companyId);
        if (validCount != productIds.Count)
            return Results.BadRequest(new { message = "Un ou plusieurs produits liés au service sont introuvables." });

        return null;
    }

    private static ServiceResponse ToResponse(Service service) => new(
        service.Id, service.Name, service.FixedPrice, service.Category, service.Active,
        service.StockLinks.Select(l => new ServiceStockLinkResponse(l.ProductId, l.Product?.Name ?? "—", l.QuantityConsumedInBaseUnits)).ToList());
}
