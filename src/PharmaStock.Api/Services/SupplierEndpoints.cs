using Microsoft.EntityFrameworkCore;
using Npgsql;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record SupplierRequest(string Name, string? ContactPhone, string? ContactEmail);
public record SupplierResponse(Guid Id, string Name, string? ContactPhone, string? ContactEmail);

// Full CRUD — list/create originally backed just the purchase-order supplier
// picker (Section 3.4); update/delete back the dedicated supplier management
// screen. Delete is a hard delete (no ArchivedAt/IsActive flag on Supplier)
// since a supplier has no history of its own the way a Product does — any FK
// still pointing at it (Product.SupplierId, PurchaseOrder.SupplierId) blocks
// the delete at the database level, caught below into a friendly message
// instead of a raw 500.
public static class SupplierEndpoints
{
    public static void MapSupplierEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/suppliers").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, string? search, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.Suppliers.Where(s => s.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(s => EF.Functions.ILike(s.Name, $"%{search}%"));

            var suppliers = await query
                .OrderBy(s => s.Name)
                .Select(s => new SupplierResponse(s.Id, s.Name, s.ContactPhone, s.ContactEmail))
                .ToListAsync();

            return Results.Ok(suppliers);
        });

        group.MapPost("/", async (Guid companyId, SupplierRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du fournisseur est requis." });

            var supplier = new Supplier
            {
                CompanyId = companyId,
                Name = request.Name.Trim(),
                ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone) ? null : request.ContactPhone.Trim(),
                ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? null : request.ContactEmail.Trim(),
            };
            db.Suppliers.Add(supplier);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/suppliers/{supplier.Id}",
                new SupplierResponse(supplier.Id, supplier.Name, supplier.ContactPhone, supplier.ContactEmail));
        });

        group.MapPut("/{supplierId:guid}", async (Guid companyId, Guid supplierId, SupplierRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom du fournisseur est requis." });

            var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId && s.CompanyId == companyId);
            if (supplier is null)
                return Results.NotFound(new { message = "Fournisseur introuvable." });

            supplier.Name = request.Name.Trim();
            supplier.ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone) ? null : request.ContactPhone.Trim();
            supplier.ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? null : request.ContactEmail.Trim();
            await db.SaveChangesAsync();

            return Results.Ok(new SupplierResponse(supplier.Id, supplier.Name, supplier.ContactPhone, supplier.ContactEmail));
        });

        group.MapDelete("/{supplierId:guid}", async (Guid companyId, Guid supplierId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId && s.CompanyId == companyId);
            if (supplier is null)
                return Results.NotFound(new { message = "Fournisseur introuvable." });

            db.Suppliers.Remove(supplier);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsForeignKeyViolation(ex))
            {
                return Results.Conflict(new { message = "Ce fournisseur est utilisé par des produits ou des bons de commande et ne peut pas être supprimé." });
            }

            return Results.NoContent();
        });
    }

    private static bool IsForeignKeyViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation };
}
