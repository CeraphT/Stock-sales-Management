using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

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

        // SetNull rather than Restrict: deleting a category should never be
        // blocked by products still referencing it — it just clears their
        // category instead of forcing every product to be reassigned first.
        builder.HasOne(p => p.Category)
            .WithMany()
            .HasForeignKey(p => p.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

/// <summary>Category names are unique per company (case-sensitive at the DB
/// level) so the picker/management screen never shows visually duplicate
/// entries created by two people at once.</summary>
public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.HasIndex(c => new { c.CompanyId, c.Name }).IsUnique();
    }
}

/// <summary>Section 16.6 — a company's branches. Restrict delete everywhere a
/// Location is referenced (Batch, Sale, StockMovement) so a branch with any
/// stock or sales history can't be deleted out from under that history by
/// accident; deactivate via Location.Active instead.</summary>
public class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> builder)
    {
        builder.HasIndex(l => l.CompanyId);
    }
}

public class BatchConfiguration : IEntityTypeConfiguration<Batch>
{
    public void Configure(EntityTypeBuilder<Batch> builder)
    {
        builder.HasOne(b => b.Location)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Section 16.6 — StockMovement has two independent FKs to Location
/// (LocationId always; DestinationLocationId only for Type == Transfer), so
/// both must be configured explicitly with distinct navigations — EF can't
/// infer which is which from convention alone when a type has more than one
/// relationship to the same target.</summary>
public class StockMovementConfiguration : IEntityTypeConfiguration<StockMovement>
{
    public void Configure(EntityTypeBuilder<StockMovement> builder)
    {
        builder.HasOne(m => m.Location)
            .WithMany()
            .HasForeignKey(m => m.LocationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(m => m.DestinationLocation)
            .WithMany()
            .HasForeignKey(m => m.DestinationLocationId)
            .OnDelete(DeleteBehavior.Restrict);
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

/// <summary>Section 21.1. The refresh-token hash is looked up directly on
/// every /api/auth/refresh call, so it needs an index; unique because two
/// devices could otherwise theoretically collide on the same stored hash
/// and silently authenticate as each other.</summary>
public class DeviceConfiguration : IEntityTypeConfiguration<Device>
{
    public void Configure(EntityTypeBuilder<Device> builder)
    {
        builder.HasIndex(d => d.RefreshTokenHash).IsUnique();

        builder.HasOne(d => d.User)
            .WithMany(u => u.Devices)
            .HasForeignKey(d => d.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

/// <summary>Phone is the login identifier (Section 3.7). Unique per company
/// rather than globally, since the same person could legitimately hold a
/// staff account at two different companies in this multi-tenant system.
/// SuperAdmin accounts (CompanyId null) are exempt — Postgres treats each
/// NULL as distinct, so multiple SuperAdmins never collide here.</summary>
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasIndex(u => new { u.CompanyId, u.Phone }).IsUnique();
    }
}

/// <summary>A sale can mix product lines and service lines on the same
/// receipt (Section 20.2) — both are configured with Restrict delete behavior
/// so a sale's history is never silently lost if a product or service is removed.</summary>
public class SaleConfiguration : IEntityTypeConfiguration<Sale>
{
    public void Configure(EntityTypeBuilder<Sale> builder)
    {
        builder.HasOne(s => s.Location)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);

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

        builder.HasOne(s => s.Shift)
            .WithMany(sh => sh.Sales)
            .HasForeignKey(s => s.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Section 3.6. The partial unique index is the actual guarantee
/// behind "only one open shift per location" — an application-level check
/// (query-then-insert) has a race window two cashiers opening at the same
/// moment could slip through; the DB constraint can't be raced. ShiftStatus
/// is stored as its int value by convention (Open = 0), which HasFilter's
/// raw SQL predicate has to match directly since it isn't translated.</summary>
public class CashRegisterShiftConfiguration : IEntityTypeConfiguration<CashRegisterShift>
{
    public void Configure(EntityTypeBuilder<CashRegisterShift> builder)
    {
        builder.HasIndex(s => s.LocationId)
            .IsUnique()
            .HasFilter("\"Status\" = 0");

        builder.HasOne(s => s.Location)
            .WithMany()
            .HasForeignKey(s => s.LocationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(s => s.OpenedByUser)
            .WithMany()
            .HasForeignKey(s => s.OpenedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(s => s.ClosedByUser)
            .WithMany()
            .HasForeignKey(s => s.ClosedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
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

/// <summary>Restrict on every FK (Location, Supplier, CreatedByUser) so a
/// purchase order's paper trail is never silently lost by deleting something
/// it references — same reasoning as Sale/CashRegisterShift. Lines cascade
/// with their parent PO since they have no meaning independent of it.</summary>
public class PurchaseOrderConfiguration : IEntityTypeConfiguration<PurchaseOrder>
{
    public void Configure(EntityTypeBuilder<PurchaseOrder> builder)
    {
        builder.HasOne(o => o.Location)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(o => o.Supplier)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(o => o.CreatedByUser)
            .WithMany()
            .HasForeignKey(o => o.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(o => o.Lines)
            .WithOne(l => l.PurchaseOrder)
            .HasForeignKey(l => l.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class PurchaseOrderLineConfiguration : IEntityTypeConfiguration<PurchaseOrderLine>
{
    public void Configure(EntityTypeBuilder<PurchaseOrderLine> builder)
    {
        builder.HasOne(l => l.Product)
            .WithMany()
            .OnDelete(DeleteBehavior.Restrict);
    }
}
