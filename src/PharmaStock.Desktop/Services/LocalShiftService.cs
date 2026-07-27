using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Desktop.Services;

/// <summary>Section 6 — local-first replacement for PharmaStockApiClient's
/// shift open/close calls, reimplementing ShiftEndpoints.cs locally
/// (including the same already-open pre-check) so shift lifecycle works
/// fully offline. Kept as its own file/class rather than folded into
/// LocalSalesService, mirroring the existing server-side split between
/// SaleEndpoints.cs and ShiftEndpoints.cs.</summary>
public class LocalShiftService
{
    private readonly IDbContextFactory<PharmaStockDbContext> _dbFactory;
    private readonly SessionService _session;
    private readonly LocalDbWriteLock _writeLock;

    public LocalShiftService(IDbContextFactory<PharmaStockDbContext> dbFactory, SessionService session, LocalDbWriteLock writeLock)
    {
        _dbFactory = dbFactory;
        _session = session;
        _writeLock = writeLock;
    }

    public Task<ShiftDetailResponse> OpenShiftAsync(Guid companyId, Guid locationId, decimal openingCashAmount, CancellationToken ct = default)
        => _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);

            var locationExists = await db.Locations.AnyAsync(l => l.Id == locationId && l.CompanyId == companyId, ct);
            if (!locationExists)
                throw new PharmaStockApiException(404, "Emplacement introuvable.");

            var alreadyOpen = await db.CashRegisterShifts
                .AnyAsync(s => s.LocationId == locationId && s.Status == ShiftStatus.Open, ct);
            if (alreadyOpen)
                throw new PharmaStockApiException(409, "Une caisse est déjà ouverte pour cet emplacement.");

            var userId = _session.UserId ?? throw new PharmaStockApiException(401, "Session locale introuvable.");

            var shift = new CashRegisterShift
            {
                CompanyId = companyId,
                LocationId = locationId,
                OpenedByUserId = userId,
                OpeningCashAmount = openingCashAmount,
                SyncStatus = SyncStatus.PendingPush,
            };

            db.CashRegisterShifts.Add(shift);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                throw new PharmaStockApiException(409, "Une caisse est déjà ouverte pour cet emplacement.");
            }

            return await ToDetailAsync(db, shift.Id, ct);
        }, ct);

    public async Task<ShiftDetailResponse?> GetCurrentShiftAsync(Guid companyId, Guid locationId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var shift = await db.CashRegisterShifts
            .FirstOrDefaultAsync(s => s.LocationId == locationId && s.CompanyId == companyId && s.Status == ShiftStatus.Open, ct);

        return shift is null ? null : await ToDetailAsync(db, shift.Id, ct);
    }

    public Task<ShiftDetailResponse> CloseShiftAsync(Guid companyId, Guid shiftId, decimal closingCashAmount, string? closingNotes, CancellationToken ct = default)
        => _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);

            var shift = await db.CashRegisterShifts.FirstOrDefaultAsync(s => s.Id == shiftId && s.CompanyId == companyId, ct);
            if (shift is null)
                throw new PharmaStockApiException(404, "Caisse introuvable.");
            if (shift.Status == ShiftStatus.Closed)
                throw new PharmaStockApiException(400, "Cette caisse est déjà fermée.");

            var userId = _session.UserId ?? throw new PharmaStockApiException(401, "Session locale introuvable.");
            var cashTotal = await ComputeCashTotalAsync(db, shiftId, ct);

            shift.Status = ShiftStatus.Closed;
            shift.ClosedAt = DateTime.UtcNow;
            shift.ClosedByUserId = userId;
            shift.ClosingCashAmount = closingCashAmount;
            shift.ExpectedCashAmount = shift.OpeningCashAmount + cashTotal;
            shift.Discrepancy = closingCashAmount - shift.ExpectedCashAmount;
            shift.ClosingNotes = closingNotes;
            if (shift.SyncStatus == SyncStatus.Synced)
                shift.SyncStatus = SyncStatus.PendingPush;

            await db.SaveChangesAsync(ct);

            return await ToDetailAsync(db, shift.Id, ct);
        }, ct);

    private static async Task<decimal> ComputeCashTotalAsync(PharmaStockDbContext db, Guid shiftId, CancellationToken ct)
    {
        var directCash = await db.Sales
            .Where(s => s.ShiftId == shiftId && s.PaymentMethod == PaymentMethod.Cash)
            .SumAsync(s => (decimal?)s.Total, ct) ?? 0m;

        var splitCash = await db.PaymentSplits
            .Where(p => p.Sale!.ShiftId == shiftId && p.Method == PaymentMethod.Cash)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

        return directCash + splitCash;
    }

    private static async Task<ShiftDetailResponse> ToDetailAsync(PharmaStockDbContext db, Guid shiftId, CancellationToken ct)
    {
        var shift = await db.CashRegisterShifts
            .Include(s => s.Location)
            .Include(s => s.OpenedByUser)
            .Include(s => s.ClosedByUser)
            .FirstAsync(s => s.Id == shiftId, ct);

        var directTotals = await db.Sales
            .Where(s => s.ShiftId == shiftId && s.PaymentMethod != PaymentMethod.Split)
            .GroupBy(s => s.PaymentMethod)
            .Select(g => new { Method = g.Key, Total = g.Sum(s => s.Total) })
            .ToListAsync(ct);

        var splitTotals = await db.PaymentSplits
            .Where(p => p.Sale!.ShiftId == shiftId)
            .GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Total = g.Sum(p => p.Amount) })
            .ToListAsync(ct);

        var breakdown = directTotals
            .Concat(splitTotals)
            .GroupBy(t => t.Method)
            .Select(g => new PaymentMethodTotal(g.Key, g.Sum(t => t.Total)))
            .OrderByDescending(t => t.Total)
            .ToList();

        var salesCount = await db.Sales.CountAsync(s => s.ShiftId == shiftId, ct);
        var totalSales = await db.Sales.Where(s => s.ShiftId == shiftId).SumAsync(s => (decimal?)s.Total, ct) ?? 0m;

        return new ShiftDetailResponse(
            shift.Id, shift.LocationId, shift.Location!.Name, shift.OpenedByUser!.Name,
            shift.ClosedByUser?.Name, shift.Status, shift.OpenedAt, shift.ClosedAt,
            shift.OpeningCashAmount, shift.ClosingCashAmount, shift.ExpectedCashAmount, shift.Discrepancy, shift.ClosingNotes,
            salesCount, totalSales, breakdown);
    }
}
