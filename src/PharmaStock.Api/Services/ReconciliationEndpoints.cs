using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record AcknowledgeShiftConflictsResponse(int Acknowledged);

public record ConflictShiftItem(
    Guid Id, string LocationName, string OpenedByName,
    DateTime OpenedAt, DateTime? ClosedAt,
    decimal OpeningCashAmount, decimal? ClosingCashAmount, decimal? ExpectedCashAmount, decimal? Discrepancy,
    string? ClosingNotes);

public record NegativeBatchItem(
    Guid Id, Guid ProductId, string ProductName, string BatchNumber,
    int QuantityInBaseUnits, string LocationName, DateTime? ExpiryDate);

public record ReconciliationResponse(List<ConflictShiftItem> ConflictShifts, List<NegativeBatchItem> NegativeBatches);

public static class ReconciliationEndpoints
{
    public static void MapReconciliationEndpoints(this WebApplication app)
    {
        // The full reconciliation worklist for the admin screen: unreviewed
        // auto-closed shift conflicts + negative-stock batches (both the signals
        // behind the dashboard "needs reconciliation" banner, Section 6).
        app.MapGet("/api/companies/{companyId:guid}/reconciliation", async (
            Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var conflictShifts = await db.CashRegisterShifts
                .Where(s => s.CompanyId == companyId && s.ClosingNotes != null
                    && s.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictMarker)
                    && !s.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictReviewedMarker))
                .OrderByDescending(s => s.OpenedAt)
                .Select(s => new ConflictShiftItem(
                    s.Id,
                    db.Locations.Where(l => l.Id == s.LocationId).Select(l => l.Name).FirstOrDefault() ?? "",
                    db.Users.Where(u => u.Id == s.OpenedByUserId).Select(u => u.Name).FirstOrDefault() ?? "",
                    s.OpenedAt, s.ClosedAt, s.OpeningCashAmount, s.ClosingCashAmount, s.ExpectedCashAmount, s.Discrepancy,
                    s.ClosingNotes))
                .ToListAsync();

            var negativeBatches = await db.Batches
                .Where(b => b.Product!.CompanyId == companyId && b.QuantityInBaseUnits < 0)
                .OrderBy(b => b.Product!.Name)
                .Select(b => new NegativeBatchItem(
                    b.Id, b.ProductId, b.Product!.Name, b.BatchNumber, b.QuantityInBaseUnits,
                    db.Locations.Where(l => l.Id == b.LocationId).Select(l => l.Name).FirstOrDefault() ?? "",
                    b.ExpiryDate))
                .ToListAsync();

            return Results.Ok(new ReconciliationResponse(conflictShifts, negativeBatches));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Acknowledge a single conflict shift (from the reconciliation list).
        app.MapPost("/api/companies/{companyId:guid}/reconciliation/shifts/{shiftId:guid}/acknowledge", async (
            Guid companyId, Guid shiftId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var shift = await db.CashRegisterShifts.FirstOrDefaultAsync(s => s.Id == shiftId && s.CompanyId == companyId);
            if (shift is null)
                return Results.NotFound();
            if (shift.ClosingNotes != null
                && shift.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictMarker)
                && !shift.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictReviewedMarker))
            {
                shift.ClosingNotes = $"{shift.ClosingNotes} {DashboardEndpoints.ShiftConflictReviewedMarker}";
                await db.SaveChangesAsync();
            }
            return Results.Ok(new AcknowledgeShiftConflictsResponse(1));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));

        // Acknowledge ALL unreviewed conflict shifts at once — appends the
        // "reviewed" marker (original conflict note preserved for audit) so they
        // drop out of DashboardEndpoints.autoClosedShiftConflictCount. No schema
        // change: same marker-string approach as the conflict note itself.
        app.MapPost("/api/companies/{companyId:guid}/reconciliation/acknowledge-shift-conflicts", async (
            Guid companyId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var shifts = await db.CashRegisterShifts
                .Where(s => s.CompanyId == companyId && s.ClosingNotes != null
                    && s.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictMarker)
                    && !s.ClosingNotes.Contains(DashboardEndpoints.ShiftConflictReviewedMarker))
                .ToListAsync();

            foreach (var s in shifts)
                s.ClosingNotes = $"{s.ClosingNotes} {DashboardEndpoints.ShiftConflictReviewedMarker}";

            await db.SaveChangesAsync();
            return Results.Ok(new AcknowledgeShiftConflictsResponse(shifts.Count));
        }).RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.CompanyAdmin), nameof(UserRole.SuperAdmin)));
    }
}
