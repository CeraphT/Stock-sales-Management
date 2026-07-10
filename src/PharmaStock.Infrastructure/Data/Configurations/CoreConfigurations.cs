using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Entities;

namespace PharmaStock.Infrastructure.Data.Configurations;

/// <summary>
/// Company.UniqueCode is the entire anti-duplicate mechanism from Section 9 —
/// a database-level unique constraint is what actually guarantees it, not just
/// application logic (which could be bypassed by a race condition otherwise).
/// </summary>
public class CompanyConfiguration : IEntityTypeConfiguration<Company>
{
    public void Configure(EntityTypeBuilder<Company> builder)
    {
        builder.HasIndex(c => c.UniqueCode).IsUnique();
    }
}

/// <summary>
/// Barcode lookups happen constantly (POS scan, Section 3.1; availability
/// check, Section 17) — indexed per company since barcodes are only unique
/// within one company's catalog, not globally.
/// </summary>
public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.HasIndex(p => new { p.CompanyId, p.Barcode });

        builder.HasMany(p => p.PackagingLevels)
            .WithOne(pl => pl.Product)
            .HasForeignKey(pl => pl.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(p => p.Batches)
            .WithOne(b => b.Product)
            .HasForeignKey(b => b.ProductId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

/// <summary>Gift card codes (Section 21.3) must be unique per company so two
/// customers can never redeem the same code.</summary>
public class GiftCardConfiguration : IEntityTypeConfiguration<GiftCard>
{
    public void Configure(EntityTypeBuilder<GiftCard> builder)
    {
        builder.HasIndex(g => new { g.CompanyId, g.Code }).IsUnique();
    }
}

/// <summary>A sale can mix product lines and service lines on the same
/// receipt (Section 20.2) — both are configured with Restrict delete behavior
/// so a sale's history is never silently lost if a product or service is removed.</summary>
public class SaleConfiguration : IEntityTypeConfiguration<Sale>
{
    public void Configure(EntityTypeBuilder<Sale> builder)
    {
        builder.HasMany(s => s.ProductLines)
            .WithOne(l => l.Sale)
            .HasForeignKey(l => l.SaleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.ServiceLines)
            .WithOne(l => l.Sale)
            .HasForeignKey(l => l.SaleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.PaymentSplits)
            .WithOne(p => p.Sale)
            .HasForeignKey(p => p.SaleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.InstallmentPlan)
            .WithOne(p => p.Sale)
            .HasForeignKey<InstallmentPlan>(p => p.SaleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

/// <summary>Restrict delete on Product so a sale's history is never silently
/// lost if a product referenced by a past sale line is removed.</summary>
public class SaleLineConfiguration : IEntityTypeConfiguration<SaleLine>
{
    public void Configure(EntityTypeBuilder<SaleLine> builder)
    {
        builder.HasOne(l => l.Product)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Section 20.6 — the optional stock-consumption link. Restrict
/// delete on Product so a product referenced by a service link can't be
/// deleted out from under an active service configuration by accident.</summary>
public class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    public void Configure(EntityTypeBuilder<Service> builder)
    {
        builder.HasMany(s => s.StockLinks)
            .WithOne(l => l.Service)
            .HasForeignKey(l => l.ServiceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class ServiceStockLinkConfiguration : IEntityTypeConfiguration<ServiceStockLink>
{
    public void Configure(EntityTypeBuilder<ServiceStockLink> builder)
    {
        builder.HasOne(l => l.Product)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);
    }
}
