using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using PharmaStock.Domain.Models;

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

    // Registered here (not in each composition root's Program.cs/
    // MauiProgram.cs) so the UpdatedAt-stamping behavior that Section 6's
    // sync pull depends on is always active regardless of who instantiates
    // the context — additive-only, does not change any existing behavior.
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.AddInterceptors(new TimestampSaveChangesInterceptor());

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<Location> Locations => Set<Location>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPackagingLevel> ProductPackagingLevels => Set<ProductPackagingLevel>();
    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<ProductSerial> ProductSerials => Set<ProductSerial>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<LoyaltyAccount> LoyaltyAccounts => Set<LoyaltyAccount>();
    public DbSet<GiftCard> GiftCards => Set<GiftCard>();

    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleLine> SaleLines => Set<SaleLine>();
    public DbSet<PaymentSplit> PaymentSplits => Set<PaymentSplit>();
    public DbSet<CashRegisterShift> CashRegisterShifts => Set<CashRegisterShift>();

    public DbSet<Service> Services => Set<Service>();
    public DbSet<ServiceLine> ServiceLines => Set<ServiceLine>();
    public DbSet<ServiceStockLink> ServiceStockLinks => Set<ServiceStockLink>();

    public DbSet<InstallmentPlan> InstallmentPlans => Set<InstallmentPlan>();
    public DbSet<InstallmentPayment> InstallmentPayments => Set<InstallmentPayment>();

    public DbSet<CustomFieldDefinition> CustomFieldDefinitions => Set<CustomFieldDefinition>();
    public DbSet<CustomFieldValue> CustomFieldValues => Set<CustomFieldValue>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

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

        // Npgsql maps DateTime to Postgres "timestamp with time zone" and
        // refuses to write any value whose Kind isn't Utc. Server-generated
        // timestamps (DateTime.UtcNow defaults) already satisfy that, but a
        // DateTime deserialized from a JSON request body with no offset
        // (e.g. a batch expiry date like "2027-08-01") comes in as
        // Kind=Unspecified and would otherwise throw at SaveChanges for
        // every endpoint that ever accepts a date from a client. Coercing at
        // the model level here means every current and future DateTime
        // column is covered, not just the ones we've hit so far.
        var utcConverter = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v : DateTime.SpecifyKind(v, DateTimeKind.Utc),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        var nullableUtcConverter = new ValueConverter<DateTime?, DateTime?>(
            v => v.HasValue && v.Value.Kind != DateTimeKind.Utc ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v,
            v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);

        foreach (var property in modelBuilder.Model.GetEntityTypes().SelectMany(t => t.GetProperties()))
        {
            if (property.ClrType == typeof(DateTime))
                property.SetValueConverter(utcConverter);
            else if (property.ClrType == typeof(DateTime?))
                property.SetValueConverter(nullableUtcConverter);
        }

        base.OnModelCreating(modelBuilder);
    }
}
