namespace PharmaStock.Domain.Models;

/// <summary>An image attached to a SupportTicket (screenshot, photo of the
/// screen/receipt…). Stored in the database (bytea) — a handful of images per
/// ticket, size-capped at upload — so no separate file store is needed.</summary>
public class SupportAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TicketId { get; set; }
    public SupportTicket? Ticket { get; set; }

    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "image/jpeg";
    public int SizeBytes { get; set; }
    public byte[] Data { get; set; } = Array.Empty<byte>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
