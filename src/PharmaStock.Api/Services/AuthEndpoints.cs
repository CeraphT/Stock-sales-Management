using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record LoginRequest(string Phone, string Password);
public record CreateStaffUserRequest(string Name, string Phone, string Password, UserRole Role);
public record UserResponse(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record AuthResponse(string Token, DateTime ExpiresAt, UserResponse User, Guid? CompanyId);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        // Section 3.7 — login by phone + password. Phone is only unique per
        // company (UserConfiguration), so a phone shared across two companies'
        // staff is checked against every matching account rather than assumed
        // to resolve to a single row.
        app.MapPost("/api/auth/login", async (
            LoginRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, JwtTokenService tokens) =>
        {
            var candidates = await db.Users
                .Where(u => u.Phone == request.Phone && u.Active)
                .ToListAsync();

            foreach (var user in candidates)
            {
                if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
                    == PasswordVerificationResult.Success)
                {
                    var (token, expiresAt) = tokens.IssueToken(user);
                    return Results.Ok(new AuthResponse(
                        token, expiresAt,
                        new UserResponse(user.Id, user.Name, user.Phone, user.Role, user.Active),
                        user.CompanyId));
                }
            }

            return Results.Unauthorized();
        });

        // Section 3.7 — a CompanyAdmin adds staff accounts (cashiers, or a
        // second admin) after the company's own admin account already exists
        // (created alongside the company itself, see CompanyEndpoints). The
        // target company is always the caller's own — SuperAdmin aside, an
        // admin can never create a user in a company that is not theirs.
        app.MapPost("/api/companies/{companyId:guid}/users", async (
            Guid companyId, CreateStaffUserRequest request, PharmaStockDbContext db,
            IPasswordHasher<User> hasher, HttpContext http) =>
        {
            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var callerCompanyId = http.User.GetCompanyId();

            if (callerRole != nameof(UserRole.SuperAdmin) && callerCompanyId != companyId)
                return Results.Forbid();

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { message = "Password must be at least 6 characters." });

            var companyExists = await db.Companies.AnyAsync(c => c.Id == companyId);
            if (!companyExists)
                return Results.NotFound(new { message = "Company not found." });

            var user = new User
            {
                CompanyId = companyId,
                Name = request.Name,
                Phone = request.Phone,
                Role = request.Role,
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);

            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/users/{user.Id}",
                new UserResponse(user.Id, user.Name, user.Phone, user.Role, user.Active));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }
}
