using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class McpGrantConfiguration : IEntityTypeConfiguration<McpGrant>
{
    public void Configure(EntityTypeBuilder<McpGrant> builder)
    {
        builder.Property(g => g.ClientId).HasMaxLength(100);
        builder.Property(g => g.Scope).HasMaxLength(200);
        builder.Property(g => g.RefreshTokenHash).HasMaxLength(64);
        builder.HasIndex(g => g.RefreshTokenHash).IsUnique();
        builder.HasIndex(g => new { g.CompanyId, g.UserId });
        builder.HasOne(g => g.User).WithMany().HasForeignKey(g => g.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(g => g.Company).WithMany().HasForeignKey(g => g.CompanyId).OnDelete(DeleteBehavior.Cascade);
    }
}
