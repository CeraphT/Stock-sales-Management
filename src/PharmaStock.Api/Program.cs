using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
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
builder.Services.AddHttpClient(); // outbound FX-rate lookups for currency conversion

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
// CORS for the browser-engine clients (the Tauri desktop webview, and the
// Vite dev server when running the desktop UI in a plain browser). The API is
// otherwise called by native HTTP stacks (MAUI/Expo) that aren't subject to
// CORS. Dev-permissive on purpose — tighten WithOrigins for production, where
// the desktop app is served from a fixed tauri:// / app origin.
const string DevClientsCors = "DevClients";
builder.Services.AddCors(options =>
    options.AddPolicy(DevClientsCors, policy => policy
        .SetIsOriginAllowed(_ => true)
        .AllowAnyHeader()
        .AllowAnyMethod()));

builder.Services.AddAuthorization(options =>
    // The only role check today that must exclude CompanyAdmin — every other
    // RequireRole call in this codebase deliberately allows CompanyAdmin *or*
    // SuperAdmin (a company managing its own data). Cross-tenant SuperAdmin
    // endpoints need this narrower policy instead.
    options.AddPolicy("SuperAdminOnly", policy => policy.RequireRole(nameof(UserRole.SuperAdmin))));

var app = builder.Build();

app.UseCors(DevClientsCors);
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.MapAuthEndpoints();
app.MapCompanyEndpoints();
app.MapCurrencyEndpoints();
app.MapLocationEndpoints();
app.MapProductEndpoints();
app.MapSaleEndpoints();
app.MapStockMovementEndpoints();
app.MapDashboardEndpoints();
app.MapCategoryEndpoints();
app.MapShiftEndpoints();
app.MapReportingEndpoints();
app.MapTaxDeclarationEndpoints();
app.MapSupplierEndpoints();
app.MapPurchaseOrderEndpoints();
app.MapSyncEndpoints();
app.MapSuperAdminEndpoints();
app.MapCustomerEndpoints();
app.MapGiftCardEndpoints();
app.MapRewardEndpoints();
app.MapLoyaltyEndpoints();
app.MapRefundEndpoints();
app.MapServiceEndpoints();
app.MapReconciliationEndpoints();

app.Run();
