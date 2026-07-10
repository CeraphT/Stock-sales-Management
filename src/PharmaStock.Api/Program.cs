using Microsoft.EntityFrameworkCore;
using PharmaStock.Api.Endpoints;
using PharmaStock.Infrastructure.Data;

var builder = WebApplication.CreateBuilder(args);

// PostgreSQL is the server-side source of truth (Section 2); Desktop/Mobile
// point the same DbContext at a local SQLite file instead (Section 6).
builder.Services.AddDbContext<PharmaStockDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")
        ?? "Host=localhost;Database=pharmastock;Username=postgres;Password=postgres"));

builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.MapCompanyEndpoints();
app.MapProductEndpoints();

app.Run();
