using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class McpClientConfiguration : IEntityTypeConfiguration<McpClient>
{
    public void Configure(EntityTypeBuilder<McpClient> builder)
    {
        builder.Property(c => c.ClientId).HasMaxLength(100);
        builder.Property(c => c.ClientName).HasMaxLength(200);
        builder.Property(c => c.RedirectUris).HasMaxLength(4000);
        builder.HasIndex(c => c.ClientId).IsUnique();
    }
}
