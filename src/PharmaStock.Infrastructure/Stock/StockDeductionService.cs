using Microsoft.EntityFrameworkCore;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Infrastructure.Stock;

public class InsufficientStockException : Exception
{
    public Guid ProductId { get; }
    public int Requested { get; }
    public int Available { get; }

    public InsufficientStockException(Guid productId, int requested, int available)
        : base($"Insufficient stock for product {productId}: requested {requested}, available {available}.")
    {
        ProductId = productId;
        Requested = requested;
        Available = available;
    }
}

public record StockDeductionResult(Guid BatchId, int QuantityInBaseUnits);

/// <summary>Section 16.1 — FEFO (First-Expired-First-Out) stock rotation.
/// Shared by the Sales endpoint (product lines and service stock-consumption
/// links) and, later, manual stock-out adjustments — anywhere base units need
/// to be pulled from whichever batch expires soonest rather than picked by hand.</summary>
public class StockDeductionService
{
    private readonly PharmaStockDbContext _db;

    public StockDeductionService(PharmaStockDbContext db)
    {
        _db = db;
    }

    /// <summary>Locks the product's in-stock batches for the duration of the
    /// caller's transaction (SELECT ... FOR UPDATE) so two concurrent sales
    /// can never both deduct from the same last unit of stock, then consumes
    /// oldest-expiry-first until the request is satisfied. Does not call
    /// SaveChanges — the caller commits alongside its own StockMovement rows.</summary>
    public async Task<List<StockDeductionResult>> DeductFefoAsync(
        Guid productId, int quantityInBaseUnits, CancellationToken ct = default)
    {
        if (quantityInBaseUnits <= 0)
            return new List<StockDeductionResult>();

        var batches = await _db.Batches
            .FromSqlInterpolated($@"
                SELECT * FROM ""Batches""
                WHERE ""ProductId"" = {productId} AND ""QuantityInBaseUnits"" > 0
                ORDER BY ""ExpiryDate"" ASC NULLS LAST
                FOR UPDATE")
            .ToListAsync(ct);

        var remaining = quantityInBaseUnits;
        var results = new List<StockDeductionResult>();

        foreach (var batch in batches)
        {
            if (remaining <= 0) break;

            var take = Math.Min(remaining, batch.QuantityInBaseUnits);
            batch.QuantityInBaseUnits -= take;
            remaining -= take;
            results.Add(new StockDeductionResult(batch.Id, take));
        }

        if (remaining > 0)
        {
            var available = quantityInBaseUnits - remaining;
            throw new InsufficientStockException(productId, quantityInBaseUnits, available);
        }

        return results;
    }
}
