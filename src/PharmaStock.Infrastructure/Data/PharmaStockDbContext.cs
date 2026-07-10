using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Entities;

namespace PharmaStock.Infrastructure.Data;

/// <summary>
/// The single EF Core context shared by the API (server-side, PostgreSQL) and,
/// via a SQLite provider swap, by the Desktop/Mobile apps for their local
/// offline-first database (Section 6). Keeping one DbContext definition for
/// both means the schema can never silently drift between server and client.
/// </summary>
public class PharmaStockDbContext : DbContext
{
    public PharmaStockDbContext(DbContextOptions<PharmaStockDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();

    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPackagingLevel> ProductPackagingLevels => Set<ProductPackagingLevel>();
    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<LoyaltyAccount> LoyaltyAccounts => Set<LoyaltyAccount>();
    public DbSet<GiftCard> GiftCards => Set<GiftCard>();

    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleLine> SaleLines => Set<SaleLine>();
    public DbSet<PaymentSplit> PaymentSplits => Set<PaymentSplit>();

    public DbSet<Service> Services => Set<Service>();
    public DbSet<ServiceLine> ServiceLines => Set<ServiceLine>();
    public DbSet<ServiceStockLink> ServiceStockLinks => Set<ServiceStockLink>();

    public DbSet<InstallmentPlan> InstallmentPlans => Set<InstallmentPlan>();
    public DbSet<InstallmentPayment> InstallmentPayments => Set<InstallmentPayment>();

    public DbSet<CustomFieldDefinition> CustomFieldDefinitions => Set<CustomFieldDefinition>();
    public DbSet<CustomFieldValue> CustomFieldValues => Set<CustomFieldValue>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PharmaStockDbContext).Assembly);

        // Global convention: every decimal property (money amounts, balances,
        // prices) gets a consistent precision instead of relying on provider
        // defaults, which differ between PostgreSQL (server) and SQLite (client).
        foreach (var property in modelBuilder.Model.GetEntityTypes()
                     .SelectMany(t => t.GetProperties())
                     .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
        {
            property.SetPrecision(18);
            property.SetScale(2);
        }

        base.OnModelCreating(modelBuilder);
    }
}
