using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class PlatformSettingConfiguration : IEntityTypeConfiguration<PlatformSetting>
{
    public void Configure(EntityTypeBuilder<PlatformSetting> builder)
    {
        builder.Property(s => s.Key).HasMaxLength(200);
        builder.Property(s => s.Value).HasMaxLength(1000);
        builder.HasIndex(s => s.Key).IsUnique();
    }
}
