using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record OpenShiftRequest(decimal OpeningCashAmount);
public record CloseShiftRequest(decimal ClosingCashAmount, string? ClosingNotes);

public record ShiftSummaryResponse(
    Guid Id, Guid LocationId, string LocationName, string OpenedByName, string? ClosedByName,
    ShiftStatus Status, DateTime OpenedAt, DateTime? ClosedAt,
    decimal OpeningCashAmount, decimal? ClosingCashAmount, decimal? ExpectedCashAmount, decimal? Discrepancy);

public record ShiftHistoryPageResponse(List<ShiftSummaryResponse> Items, bool HasMore);

public record PaymentMethodTotal(PaymentMethod Method, decimal Total);

public record ShiftDetailResponse(
    Guid Id, Guid LocationId, string LocationName, string OpenedByName, string? ClosedByName,
    ShiftStatus Status, DateTime OpenedAt, DateTime? ClosedAt,
    decimal OpeningCashAmount, decimal? ClosingCashAmount, decimal? ExpectedCashAmount, decimal? Discrepancy, string? ClosingNotes,
    int SalesCount, decimal TotalSales, List<PaymentMethodTotal> PaymentBreakdown);

public static class ShiftEndpoints
{
    private const int ShiftHistoryPageSize = 20;

    public static void MapShiftEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/locations/{locationId:guid}/shifts/open", async (
            Guid companyId, Guid locationId, OpenShiftRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerCompanyId = http.User.GetCompanyId();
            var callerUserId = http.User.GetUserId();
            if (callerCompanyId != companyId || callerUserId is null)
                return Results.Forbid();

            var locationExists = await db.Locations.AnyAsync(l => l.Id == locationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            // Belt-and-suspenders: this check narrows the race window, but the
            // partial unique index (CashRegisterShiftConfiguration) is what
            // actually guarantees it — two cashiers opening at the same
            // instant can't both slip through even if both pass this check.
            var alreadyOpen = await db.CashRegisterShifts
                .AnyAsync(s => s.LocationId == locationId && s.Status == ShiftStatus.Open);
            if (alreadyOpen)
                return Results.Conflict(new { message = "Une caisse est déjà ouverte pour cet emplacement." });

            var shift = new CashRegisterShift
            {
                CompanyId = companyId,
                LocationId = locationId,
                OpenedByUserId = callerUserId.Value,
                OpeningCashAmount = request.OpeningCashAmount,
            };

            db.CashRegisterShifts.Add(shift);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Une caisse est déjà ouverte pour cet emplacement." });
            }

            return Results.Created($"/api/companies/{companyId}/shifts/{shift.Id}", await ToDetailAsync(db, shift.Id));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/locations/{locationId:guid}/shifts/current", async (
            Guid companyId, Guid locationId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var shift = await db.CashRegisterShifts
                .FirstOrDefaultAsync(s => s.LocationId == locationId && s.CompanyId == companyId && s.Status == ShiftStatus.Open);

            return shift is null
                ? Results.NotFound(new { message = "Aucune caisse ouverte pour cet emplacement." })
                : Results.Ok(await ToDetailAsync(db, shift.Id));
        }).RequireAuthorization();

        app.MapPost("/api/companies/{companyId:guid}/shifts/{shiftId:guid}/close", async (
            Guid companyId, Guid shiftId, CloseShiftRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerCompanyId = http.User.GetCompanyId();
            var callerUserId = http.User.GetUserId();
            if (callerCompanyId != companyId || callerUserId is null)
                return Results.Forbid();

            var shift = await db.CashRegisterShifts.FirstOrDefaultAsync(s => s.Id == shiftId && s.CompanyId == companyId);
            if (shift is null)
                return Results.NotFound(new { message = "Caisse introuvable." });
            if (shift.Status == ShiftStatus.Closed)
                return Results.BadRequest(new { message = "Cette caisse est déjà fermée." });

            var cashTotal = await ComputeCashTotalAsync(db, shiftId);

            shift.Status = ShiftStatus.Closed;
            shift.ClosedAt = DateTime.UtcNow;
            shift.ClosedByUserId = callerUserId.Value;
            shift.ClosingCashAmount = request.ClosingCashAmount;
            shift.ExpectedCashAmount = shift.OpeningCashAmount + cashTotal;
            shift.Discrepancy = request.ClosingCashAmount - shift.ExpectedCashAmount;
            shift.ClosingNotes = request.ClosingNotes;

            await db.SaveChangesAsync();

            return Results.Ok(await ToDetailAsync(db, shift.Id));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/shifts", async (
            Guid companyId, int? page, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var pageNumber = page is > 0 ? page.Value : 1;

            var shifts = await db.CashRegisterShifts
                .Where(s => s.CompanyId == companyId)
                .OrderByDescending(s => s.OpenedAt)
                .Skip((pageNumber - 1) * ShiftHistoryPageSize)
                .Take(ShiftHistoryPageSize + 1)
                .Select(s => new ShiftSummaryResponse(
                    s.Id, s.LocationId, s.Location!.Name, s.OpenedByUser!.Name,
                    s.ClosedByUser != null ? s.ClosedByUser.Name : null,
                    s.Status, s.OpenedAt, s.ClosedAt,
                    s.OpeningCashAmount, s.ClosingCashAmount, s.ExpectedCashAmount, s.Discrepancy))
                .ToListAsync();

            var hasMore = shifts.Count > ShiftHistoryPageSize;
            return Results.Ok(new ShiftHistoryPageResponse(shifts.Take(ShiftHistoryPageSize).ToList(), hasMore));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/shifts/{shiftId:guid}", async (
            Guid companyId, Guid shiftId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var exists = await db.CashRegisterShifts.AnyAsync(s => s.Id == shiftId && s.CompanyId == companyId);
            if (!exists)
                return Results.NotFound(new { message = "Caisse introuvable." });

            return Results.Ok(await ToDetailAsync(db, shiftId));
        }).RequireAuthorization();
    }

    // Cash actually collected under this shift: sales paid entirely in Cash,
    // plus the Cash portion of any Split-payment sale — Split sales aren't
    // counted via their (irrelevant) Sale.PaymentMethod, only their splits.
    private static async Task<decimal> ComputeCashTotalAsync(PharmaStockDbContext db, Guid shiftId)
    {
        var directCash = await db.Sales
            .Where(s => s.ShiftId == shiftId && s.PaymentMethod == PaymentMethod.Cash)
            .SumAsync(s => (decimal?)s.Total) ?? 0m;

        var splitCash = await db.PaymentSplits
            .Where(p => p.Sale!.ShiftId == shiftId && p.Method == PaymentMethod.Cash)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        return directCash + splitCash;
    }

    private static async Task<ShiftDetailResponse> ToDetailAsync(PharmaStockDbContext db, Guid shiftId)
    {
        var shift = await db.CashRegisterShifts
            .Include(s => s.Location)
            .Include(s => s.OpenedByUser)
            .Include(s => s.ClosedByUser)
            .FirstAsync(s => s.Id == shiftId);

        var directTotals = await db.Sales
            .Where(s => s.ShiftId == shiftId && s.PaymentMethod != PaymentMethod.Split)
            .GroupBy(s => s.PaymentMethod)
            .Select(g => new { Method = g.Key, Total = g.Sum(s => s.Total) })
            .ToListAsync();

        var splitTotals = await db.PaymentSplits
            .Where(p => p.Sale!.ShiftId == shiftId)
            .GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var breakdown = directTotals
            .Concat(splitTotals)
            .GroupBy(t => t.Method)
            .Select(g => new PaymentMethodTotal(g.Key, g.Sum(t => t.Total)))
            .OrderByDescending(t => t.Total)
            .ToList();

        var salesCount = await db.Sales.CountAsync(s => s.ShiftId == shiftId);
        var totalSales = await db.Sales.Where(s => s.ShiftId == shiftId).SumAsync(s => (decimal?)s.Total) ?? 0m;

        return new ShiftDetailResponse(
            shift.Id, shift.LocationId, shift.Location!.Name, shift.OpenedByUser!.Name,
            shift.ClosedByUser?.Name, shift.Status, shift.OpenedAt, shift.ClosedAt,
            shift.OpeningCashAmount, shift.ClosingCashAmount, shift.ExpectedCashAmount, shift.Discrepancy, shift.ClosingNotes,
            salesCount, totalSales, breakdown);
    }
}
