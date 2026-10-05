using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class SupportAttachmentConfiguration : IEntityTypeConfiguration<SupportAttachment>
{
    public void Configure(EntityTypeBuilder<SupportAttachment> builder)
    {
        builder.Property(a => a.FileName).HasMaxLength(255);
        builder.Property(a => a.ContentType).HasMaxLength(100);
    }
}
