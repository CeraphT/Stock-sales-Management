using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Entities;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Endpoints;

public record CreateCompanyRequest(string Name, string? Description, string Currency);
public record JoinCompanyRequest(string UniqueCode);
public record CompanyResponse(Guid Id, string Name, string UniqueCode, string Currency, bool ServicesModuleEnabled);

public static class CompanyEndpoints
{
    public static void MapCompanyEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/companies");

        // Section 9 — "Create a new company" path of the onboarding flow.
        // Generates the unique code that every other device will use to "join"
        // this same company rather than accidentally creating a duplicate.
        group.MapPost("/", async (CreateCompanyRequest request, PharmaStockDbContext db) =>
        {
            var company = new Company
            {
                Name = request.Name,
                Description = request.Description,
                Currency = string.IsNullOrWhiteSpace(request.Currency) ? "XAF" : request.Currency,
                UniqueCode = GenerateUniqueCode()
            };

            db.Companies.Add(company);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{company.Id}",
                new CompanyResponse(company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled));
        });

        // Section 9 — "Join an existing company" path. A device (Desktop,
        // Mobile, or Web) presents the code instead of re-creating the
        // company, which is what eliminates the duplicate-company problem
        // by construction rather than by fuzzy name-matching.
        group.MapPost("/join", async (JoinCompanyRequest request, PharmaStockDbContext db) =>
        {
            var company = await db.Companies
                .FirstOrDefaultAsync(c => c.UniqueCode == request.UniqueCode);

            if (company is null)
                return Results.NotFound(new { message = "No company found with that code." });

            return Results.Ok(new CompanyResponse(
                company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled));
        });

        group.MapGet("/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var company = await db.Companies.FindAsync(id);
            return company is null
                ? Results.NotFound()
                : Results.Ok(new CompanyResponse(
                    company.Id, company.Name, company.UniqueCode, company.Currency, company.ServicesModuleEnabled));
        });
    }

    /// <summary>Short, human-typeable code (Section 9): e.g. PHRM-7X2K9.
    /// Collision odds are negligible at this scale, but the database-level
    /// unique index (CompanyConfiguration) is the real guarantee, not this.</summary>
    private static string GenerateUniqueCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
        var random = Random.Shared;
        var suffix = new string(Enumerable.Range(0, 5).Select(_ => chars[random.Next(chars.Length)]).ToArray());
        return $"PHRM-{suffix}";
    }
}
