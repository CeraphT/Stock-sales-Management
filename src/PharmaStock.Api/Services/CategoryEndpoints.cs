using Microsoft.EntityFrameworkCore;
using Npgsql;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record CategoryRequest(string Name);
public record CategoryResponse(Guid Id, string Name);

public static class CategoryEndpoints
{
    public static void MapCategoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies/{companyId:guid}/categories").RequireAuthorization();

        group.MapGet("/", async (Guid companyId, string? search, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.Categories.Where(c => c.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(c => EF.Functions.ILike(c.Name, $"%{search}%"));

            var categories = await query
                .OrderBy(c => c.Name)
                .Select(c => new CategoryResponse(c.Id, c.Name))
                .ToListAsync();

            return Results.Ok(categories);
        });

        group.MapPost("/", async (Guid companyId, CategoryRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom de la catégorie est requis." });

            var category = new Category { CompanyId = companyId, Name = request.Name.Trim() };
            db.Categories.Add(category);

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                return Results.Conflict(new { message = $"Une catégorie nommée « {category.Name} » existe déjà." });
            }

            return Results.Created($"/api/companies/{companyId}/categories/{category.Id}",
                new CategoryResponse(category.Id, category.Name));
        });

        group.MapPut("/{categoryId:guid}", async (Guid companyId, Guid categoryId, CategoryRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(new { message = "Le nom de la catégorie est requis." });

            var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == categoryId && c.CompanyId == companyId);
            if (category is null)
                return Results.NotFound(new { message = "Catégorie introuvable." });

            category.Name = request.Name.Trim();

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                return Results.Conflict(new { message = $"Une catégorie nommée « {category.Name} » existe déjà." });
            }

            return Results.Ok(new CategoryResponse(category.Id, category.Name));
        });

        group.MapDelete("/{categoryId:guid}", async (Guid companyId, Guid categoryId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == categoryId && c.CompanyId == companyId);
            if (category is null)
                return Results.NotFound(new { message = "Catégorie introuvable." });

            // SetNull (ProductConfiguration) means any product referencing this
            // category just loses the reference — the delete is never blocked.
            db.Categories.Remove(category);
            await db.SaveChangesAsync();

            return Results.NoContent();
        });
    }

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
