using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PharmaStock.Api.Endpoints;
using PharmaStock.Api.Services;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;
using PharmaStock.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// PostgreSQL is the server-side source of truth (Section 2); Desktop/Mobile
// point the same DbContext at a local SQLite file instead (Section 6).
builder.Services.AddDbContext<PharmaStockDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")
        ?? "Host=localhost;Database=pharmastock;Username=postgres;Password=postgres"));

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<StockDeductionService>();

// Dev-only fallback secret, same pattern as the connection string above —
// production deployments must override Jwt:Secret via environment/user-secrets.
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? "dev-only-insecure-signing-key-change-before-deploying-32bytes-min";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "PharmaStock";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "PharmaStock";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.MapAuthEndpoints();
app.MapCompanyEndpoints();
app.MapProductEndpoints();
app.MapSaleEndpoints();
app.MapStockMovementEndpoints();

app.Run();
