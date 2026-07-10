namespace PharmaStock.Domain.Models;

/// <summary>Section 16.6 — a physical branch/shop. Every company gets one
/// default Location at creation, so today's single-shop usage needs no extra
/// setup; a second branch just adds another row here. Stock (Batch), Sales,
/// and StockMovements are all scoped to a Location rather than only a
/// Company, so opening a second branch later never requires retrofitting
/// these tables — the exact migration risk Section 16.6 calls out.</summary>
public class Location
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public bool Active { get; set; } = true;
}
