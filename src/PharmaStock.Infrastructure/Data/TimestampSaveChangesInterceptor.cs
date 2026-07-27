using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data;

/// <summary>Stamps ITimestamped.UpdatedAt on every insert/update, on both the
/// server (Postgres) and every offline device (SQLite) — registered once in
/// PharmaStockDbContext.OnConfiguring so neither composition root can forget
/// it. This is what makes incremental sync pull (Section 6) possible without
/// scattering "set UpdatedAt" across every endpoint that touches a
/// Product/Category/Customer/Supplier/Batch.</summary>
public class TimestampSaveChangesInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Stamp(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
    {
        Stamp(eventData.Context);
        return base.SavingChangesAsync(eventData, result, ct);
    }

    private static void Stamp(DbContext? context)
    {
        if (context is null) return;

        foreach (var entry in context.ChangeTracker.Entries<ITimestamped>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
                entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
    }
}
