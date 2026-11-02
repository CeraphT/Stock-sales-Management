using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class BackupSnapshotConfiguration : IEntityTypeConfiguration<BackupSnapshot>
{
    public void Configure(EntityTypeBuilder<BackupSnapshot> builder)
    {
        builder.Property(s => s.SourceKey).HasMaxLength(64);
        builder.HasIndex(s => new { s.Day, s.SourceKey }).IsUnique();
    }
}
