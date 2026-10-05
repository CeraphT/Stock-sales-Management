using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmaStock.Domain.Models;

namespace PharmaStock.Infrastructure.Data.Configurations;

public class SupportTicketConfiguration : IEntityTypeConfiguration<SupportTicket>
{
    public void Configure(EntityTypeBuilder<SupportTicket> builder)
    {
        builder.Property(t => t.Title).HasMaxLength(200);
        builder.Property(t => t.Description).HasMaxLength(8000);
        builder.Property(t => t.AdminReply).HasMaxLength(8000);
        builder.Property(t => t.Screen).HasMaxLength(300);
        builder.Property(t => t.DeviceInfo).HasMaxLength(300);
        builder.Property(t => t.AppVersion).HasMaxLength(50);
        builder.HasIndex(t => new { t.Status, t.CreatedAt });
        builder.HasIndex(t => t.UserId);
        builder.HasMany(t => t.Attachments).WithOne(a => a.Ticket!).HasForeignKey(a => a.TicketId).OnDelete(DeleteBehavior.Cascade);
    }
}
