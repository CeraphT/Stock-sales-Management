using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class SupportMessageConfiguration : IEntityTypeConfiguration<SupportMessage>
{
    public void Configure(EntityTypeBuilder<SupportMessage> builder)
    {
        builder.Property(m => m.Body).HasMaxLength(8000);
        builder.Property(m => m.AuthorName).HasMaxLength(200);
        builder.HasIndex(m => new { m.TicketId, m.CreatedAt });
    }
}
