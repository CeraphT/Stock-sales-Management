using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Desktop.Data;

/// <summary>Lets `dotnet ef migrations add` build a PharmaStockDbContext
/// against SQLite at design time, without going through MauiProgram (which
/// depends on FileSystem.AppDataDirectory — unavailable outside a running
/// MAUI host). Migrations produced here land in Data/Migrations.Sqlite/,
/// a separate history from the server's Postgres migrations in
/// PharmaStock.Infrastructure/Data/Migrations/ (EF Core needs a distinct
/// assembly per migration set for one DbContext/model).</summary>
public class SqliteDesignTimeDbContextFactory : IDesignTimeDbContextFactory<PharmaStockDbContext>
{
    public PharmaStockDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<PharmaStockDbContext>()
            .UseSqlite("Data Source=designtime.db", x => x.MigrationsAssembly("PharmaStock.Desktop"))
            .Options;
        return new PharmaStockDbContext(options);
    }
}
