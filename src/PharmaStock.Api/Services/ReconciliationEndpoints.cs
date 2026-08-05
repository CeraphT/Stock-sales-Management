using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record AcknowledgeShiftConflictsResponse(int Acknowledged);

public static class ReconciliationEndpoints
{
    public static void MapReconciliationEndpoints(this WebApplication app)
    {
        // A CompanyAdmin acknowledges the "needs reconciliation" shift-conflict
        // warnings shown on the dashboard (Section 6). Each affected shift's
        // ClosingNotes gets a "reviewed" marker appended — the original conflict
        // note is preserved for audit, but the shift drops out of
        // DashboardEndpoints.autoClosedShiftConflictCount, so the banner clears.
        // No schema change: same marker-string approach as the conflict note.
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
