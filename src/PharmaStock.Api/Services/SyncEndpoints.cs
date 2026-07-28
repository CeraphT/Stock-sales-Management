using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

// ---- Push (device -> server) ----

public record SyncPushSaleLine(Guid Id, Guid ProductId, Guid? BatchId, int QuantityInBaseUnits, Guid? PackagingLevelId, decimal UnitPrice, decimal TaxRatePercent);
public record SyncPushServiceLine(Guid Id, Guid ServiceId, int Quantity, decimal BilledPrice);
public record SyncPushPaymentSplit(Guid Id, PaymentMethod Method, decimal Amount);
public record SyncPushStockMovement(Guid Id, Guid ProductId, Guid? BatchId, Guid LocationId, Guid? DestinationLocationId, StockMovementType Type, int QuantityInBaseUnits, string? Reason, Guid UserId, DateTime Timestamp);

public record SyncPushSale(
    Guid Id, Guid LocationId, Guid UserId, Guid? CustomerId, Guid? ShiftId,
    decimal Total, PaymentMethod PaymentMethod, SaleStatus Status,
    decimal? AmountTendered, decimal? ChangeDue, DateTime Timestamp,
    List<SyncPushSaleLine> ProductLines, List<SyncPushServiceLine> ServiceLines,
    List<SyncPushPaymentSplit> PaymentSplits, List<SyncPushStockMovement> StockMovements,
    string? GiftCardCode = null);

public record SyncPushShiftOpen(Guid Id, Guid LocationId, Guid OpenedByUserId, decimal OpeningCashAmount, DateTime OpenedAt);
public record SyncPushShiftClose(Guid ShiftId, Guid ClosedByUserId, decimal ClosingCashAmount, string? ClosingNotes, DateTime ClosedAt);

public record SyncPushRequest(Guid DeviceId, List<SyncPushSale> Sales, List<SyncPushShiftOpen> ShiftOpens, List<SyncPushShiftClose> ShiftCloses);

public record SyncPushResult(Guid Id, bool Applied, string? SkippedReason);
public record SyncPushResponse(List<SyncPushResult> SaleResults, List<SyncPushResult> ShiftOpenResults, List<SyncPushResult> ShiftCloseResults, DateTime ServerTimestamp);

// ---- Pull (server -> device) ----

public record SyncPullPackagingLevel(Guid Id, Guid ProductId, string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);
public record SyncPullProduct(Guid Id, string Name, string? Barcode, Guid? CategoryId, decimal PurchasePrice, decimal SalePrice, Guid? SupplierId, bool IsFavorite, bool IsActive, int LowStockThreshold, decimal? TaxRateOverridePercent, DateTime UpdatedAt, List<SyncPullPackagingLevel> PackagingLevels);
public record SyncPullCategory(Guid Id, string Name, DateTime UpdatedAt);
public record SyncPullCustomer(Guid Id, string Name, string? Phone, decimal CreditBalance, int LoyaltyPointsBalance, decimal LoyaltyStoreCreditBalance, DateTime UpdatedAt);
public record SyncPullSupplier(Guid Id, string Name, string? ContactPhone, string? ContactEmail, DateTime UpdatedAt);
public record SyncPullBatch(Guid Id, Guid ProductId, Guid LocationId, string BatchNumber, DateTime? ExpiryDate, int QuantityInBaseUnits, decimal PurchasePricePerBaseUnit, DateTime UpdatedAt);
public record SyncPullLocation(Guid Id, string Name, string? Address, bool Active);
public record SyncPullCompanyInfo(
    Guid Id, string Name, string UniqueCode, string Currency, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue);
public record SyncPullGiftCard(Guid Id, string Code, decimal InitialValue, decimal RemainingValue, bool Active);

// A pulled StockMovement/Sale/CashRegisterShift always carries a real
// UserId FK (e.g. "who rang up this sale") — without a matching local User
// row, applying those rows would violate a foreign-key constraint on
// SQLite (which enforces FKs, unlike a naive read of "this is just a
// read-cache" might assume). Minimal fields only: this is a cached mirror
// for FK-satisfaction + display (cashier name on a receipt), never a
// locally-authenticatable account — login always goes through the API.
// Phone is included (not just Name) because Users.(CompanyId, Phone) has a
// unique index locally too — leaving every cached user's Phone at its
// string.Empty default would collide the moment a company has 2+ staff.
public record SyncPullUser(Guid Id, string Name, string Phone);
public record SyncPullStockMovement(Guid Id, Guid ProductId, Guid? BatchId, Guid LocationId, Guid? DestinationLocationId, StockMovementType Type, int QuantityInBaseUnits, string? Reason, Guid UserId, DateTime Timestamp);

public record SyncPullResponse(
    DateTime ServerTimestamp, SyncPullCompanyInfo Company, List<SyncPullLocation> Locations,
    List<SyncPullProduct> Products, List<SyncPullCategory> Categories,
    List<SyncPullCustomer> Customers, List<SyncPullSupplier> Suppliers,
    List<SyncPullBatch> Batches, List<SyncPullStockMovement> StockMovements,
    List<SyncPullUser> Users, List<SyncPullGiftCard> GiftCards);

/// <summary>Section 6 — offline-first sync for the POS/sales workflow.
/// Push applies Sales/StockMovements/shift events a device created while
/// offline; pull refreshes a device's local read-cache (catalog + stock) so
/// its next offline session starts from current data. See
/// StockMovement.cs's doc comment: movements are immutable and additive, so
/// two devices' pushes always merge safely regardless of order.</summary>
public static class SyncEndpoints
{
    public static void MapSyncEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/sync/push", async (
            Guid companyId, SyncPushRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var saleResults = new List<SyncPushResult>();
            var shiftOpenResults = new List<SyncPushResult>();
            var shiftCloseResults = new List<SyncPushResult>();

            foreach (var pushedShift in request.ShiftOpens)
            {
                shiftOpenResults.Add(await ApplyShiftOpenAsync(db, companyId, pushedShift));
            }

            // Defensive re-sort even though the client is expected to send in
            // creation order — protects a retried/duplicated push batch (e.g.
            // after a dropped connection mid-push) from applying out of order.
            foreach (var pushedSale in request.Sales.OrderBy(s => s.Timestamp))
            {
                saleResults.Add(await ApplySaleAsync(db, companyId, pushedSale));
            }

            foreach (var pushedClose in request.ShiftCloses)
            {
                shiftCloseResults.Add(await ApplyShiftCloseAsync(db, companyId, pushedClose));
            }

            return Results.Ok(new SyncPushResponse(saleResults, shiftOpenResults, shiftCloseResults, DateTime.UtcNow));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/sync/pull", async (
            Guid companyId, Guid locationId, DateTime? since, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var locationExists = await db.Locations.AnyAsync(l => l.Id == locationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            // Captured before any query runs: a row committed mid-request
            // (e.g. by another device's concurrent push) might otherwise fall
            // between "already excluded by the query below" and "already
            // covered by the new watermark," permanently skipping it. Capturing
            // first means such a row is simply re-included on the next pull —
            // safe, since pull application is upsert/overwrite, not additive.
            var serverTimestamp = DateTime.UtcNow;

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var locations = await db.Locations
                .Where(l => l.CompanyId == companyId)
                .Select(l => new SyncPullLocation(l.Id, l.Name, l.Address, l.Active))
                .ToListAsync();

            // Always pulled in full (no UpdatedAt/incremental filtering) —
            // the staff list is small and rarely changes, and every pulled
            // Sale/StockMovement/CashRegisterShift needs its UserId FK
            // satisfied locally, so a stale cached name is a smaller risk
            // than a missing row breaking a later pull's SaveChanges.
            var users = await db.Users
                .Where(u => u.CompanyId == companyId)
                .Select(u => new SyncPullUser(u.Id, u.Name, u.Phone))
                .ToListAsync();

            var productsQuery = db.Products.Where(p => p.CompanyId == companyId);
            if (since is not null) productsQuery = productsQuery.Where(p => p.UpdatedAt > since);
            var products = await productsQuery
                .Include(p => p.PackagingLevels)
                .Select(p => new SyncPullProduct(
                    p.Id, p.Name, p.Barcode, p.CategoryId, p.PurchasePrice, p.SalePrice, p.SupplierId,
                    p.IsFavorite, p.IsActive, p.LowStockThreshold, p.TaxRateOverridePercent, p.UpdatedAt,
                    p.PackagingLevels.Select(l => new SyncPullPackagingLevel(l.Id, l.ProductId, l.UnitName, l.QuantityInBaseUnits, l.SalePriceOverride)).ToList()))
                .ToListAsync();

            var categoriesQuery = db.Categories.Where(c => c.CompanyId == companyId);
            if (since is not null) categoriesQuery = categoriesQuery.Where(c => c.UpdatedAt > since);
            var categories = await categoriesQuery
                .Select(c => new SyncPullCategory(c.Id, c.Name, c.UpdatedAt))
                .ToListAsync();

            var customersQuery = db.Customers.Where(c => c.CompanyId == companyId);
            if (since is not null) customersQuery = customersQuery.Where(c => c.UpdatedAt > since);
            var customers = await customersQuery
                .Include(c => c.LoyaltyAccount)
                .Select(c => new SyncPullCustomer(
                    c.Id, c.Name, c.Phone, c.CreditBalance,
                    c.LoyaltyAccount != null ? c.LoyaltyAccount.PointsBalance : 0,
                    c.LoyaltyAccount != null ? c.LoyaltyAccount.StoreCreditBalance : 0,
                    c.UpdatedAt))
                .ToListAsync();

            // Always pulled in full, same reasoning as Users below: gift
            // cards are few and a device needs the CURRENT RemainingValue to
            // validate an offline redemption against, not a stale
            // incrementally-filtered one.
            var giftCards = await db.GiftCards
                .Where(g => g.CompanyId == companyId)
                .Select(g => new SyncPullGiftCard(g.Id, g.Code, g.InitialValue, g.RemainingValue, g.Active))
                .ToListAsync();

            var suppliersQuery = db.Suppliers.Where(s => s.CompanyId == companyId);
            if (since is not null) suppliersQuery = suppliersQuery.Where(s => s.UpdatedAt > since);
            var suppliers = await suppliersQuery
                .Select(s => new SyncPullSupplier(s.Id, s.Name, s.ContactPhone, s.ContactEmail, s.UpdatedAt))
                .ToListAsync();

            var batchesQuery = db.Batches.Where(b => b.LocationId == locationId);
            if (since is not null) batchesQuery = batchesQuery.Where(b => b.UpdatedAt > since);
            var batches = await batchesQuery
                .Select(b => new SyncPullBatch(b.Id, b.ProductId, b.LocationId, b.BatchNumber, b.ExpiryDate, b.QuantityInBaseUnits, b.PurchasePricePerBaseUnit, b.UpdatedAt))
                .ToListAsync();

            // StockMovement has no UpdatedAt — it's immutable/append-only, so
            // Timestamp already is its own change marker. No special-casing
            // needed for "movements from other devices": push (above) inserts
            // them as ordinary rows into this same table, so this filter picks
            // them up regardless of which device or flow created them.
            var movementsQuery = db.StockMovements.Where(m => m.LocationId == locationId);
            if (since is not null) movementsQuery = movementsQuery.Where(m => m.Timestamp > since);
            var movements = await movementsQuery
                .Select(m => new SyncPullStockMovement(m.Id, m.ProductId, m.BatchId, m.LocationId, m.DestinationLocationId, m.Type, m.QuantityInBaseUnits, m.Reason, m.UserId, m.Timestamp))
                .ToListAsync();

            return Results.Ok(new SyncPullResponse(
                serverTimestamp,
                new SyncPullCompanyInfo(
                    company.Id, company.Name, company.UniqueCode, company.Currency, company.DefaultTaxRatePercent,
                    company.LoyaltyEnabled, company.LoyaltyEarnRateAmount, company.LoyaltyPointValue),
                locations, products, categories, customers, suppliers, batches, movements, users, giftCards));
        }).RequireAuthorization();
    }

    private static async Task<SyncPushResult> ApplySaleAsync(PharmaStockDbContext db, Guid companyId, SyncPushSale pushed)
    {
        if (await db.Sales.AnyAsync(s => s.Id == pushed.Id))
            return new SyncPushResult(pushed.Id, true, null);

        var locationOk = await db.Locations.AnyAsync(l => l.Id == pushed.LocationId && l.CompanyId == companyId);
        if (!locationOk)
            return new SyncPushResult(pushed.Id, false, "Emplacement introuvable.");

        if (pushed.CustomerId is not null)
        {
            var customerOk = await db.Customers.AnyAsync(c => c.Id == pushed.CustomerId && c.CompanyId == companyId);
            if (!customerOk)
                return new SyncPushResult(pushed.Id, false, "Client introuvable.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            var sale = new Sale
            {
                Id = pushed.Id,
                CompanyId = companyId,
                LocationId = pushed.LocationId,
                UserId = pushed.UserId,
                CustomerId = pushed.CustomerId,
                ShiftId = pushed.ShiftId,
                Total = pushed.Total,
                PaymentMethod = pushed.PaymentMethod,
                Status = pushed.Status,
                AmountTendered = pushed.AmountTendered,
                ChangeDue = pushed.ChangeDue,
                Timestamp = pushed.Timestamp,
                SyncStatus = SyncStatus.Synced,
            };

            foreach (var line in pushed.ProductLines)
            {
                sale.ProductLines.Add(new SaleLine
                {
                    Id = line.Id,
                    ProductId = line.ProductId,
                    BatchId = line.BatchId,
                    QuantityInBaseUnits = line.QuantityInBaseUnits,
                    PackagingLevelId = line.PackagingLevelId,
                    UnitPrice = line.UnitPrice,
                    TaxRatePercent = line.TaxRatePercent,
                });
            }

            foreach (var line in pushed.ServiceLines)
            {
                sale.ServiceLines.Add(new ServiceLine
                {
                    Id = line.Id,
                    ServiceId = line.ServiceId,
                    Quantity = line.Quantity,
                    BilledPrice = line.BilledPrice,
                });
            }

            foreach (var split in pushed.PaymentSplits)
            {
                sale.PaymentSplits.Add(new PaymentSplit { Id = split.Id, Method = split.Method, Amount = split.Amount });
            }

            // Credit sales increase the customer's debt exactly like the
            // online endpoint does — this is idempotency-safe because the
            // whole method already short-circuits above if this Sale.Id was
            // already applied, so this addition can never run twice.
            var creditAmount = pushed.PaymentSplits.Count > 0
                ? pushed.PaymentSplits.Where(s => s.Method == PaymentMethod.Credit).Sum(s => s.Amount)
                : (pushed.PaymentMethod == PaymentMethod.Credit ? pushed.Total : 0m);
            if (creditAmount > 0 && pushed.CustomerId is not null)
            {
                var customer = await db.Customers.FindAsync(pushed.CustomerId.Value);
                if (customer is not null)
                    customer.CreditBalance += creditAmount;
            }

            // Section 21.3 — the device already deducted its own local
            // GiftCard/LoyaltyAccount rows optimistically at sale-creation
            // time (see LocalSalesService); this independently re-derives
            // and re-applies the exact same deterministic amounts against
            // the server's authoritative rows, same pattern as CreditBalance
            // above. Never trust a device-computed delta for money fields —
            // recompute from Total/PaymentSplits/PaymentMethod every time.
            sale.GiftCardCode = pushed.GiftCardCode;
            var giftCardAmount = pushed.PaymentSplits.Count > 0
                ? pushed.PaymentSplits.Where(s => s.Method == PaymentMethod.GiftCard).Sum(s => s.Amount)
                : (pushed.PaymentMethod == PaymentMethod.GiftCard ? pushed.Total : 0m);
            if (giftCardAmount > 0 && !string.IsNullOrWhiteSpace(pushed.GiftCardCode))
            {
                var giftCard = await db.GiftCards.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.Code == pushed.GiftCardCode);
                // Missing card (stale device cache): the sale still applies —
                // same leniency as a missing Batch below — a balance that
                // can't be found can't be corrupted, but the sale itself
                // must not be lost over it.
                if (giftCard is not null)
                    giftCard.RemainingValue -= giftCardAmount;
            }

            var storeCreditAmount = pushed.PaymentSplits.Count > 0
                ? pushed.PaymentSplits.Where(s => s.Method == PaymentMethod.StoreCredit).Sum(s => s.Amount)
                : (pushed.PaymentMethod == PaymentMethod.StoreCredit ? pushed.Total : 0m);
            if (storeCreditAmount > 0 && pushed.CustomerId is not null)
            {
                var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == pushed.CustomerId);
                if (loyaltyAccount is not null)
                    loyaltyAccount.StoreCreditBalance -= storeCreditAmount;
            }

            var company = await db.Companies.FindAsync(companyId);
            if (company is { LoyaltyEnabled: true } && pushed.CustomerId is not null && pushed.Total > 0)
            {
                var pointsEarned = (int)Math.Floor(pushed.Total / company.LoyaltyEarnRateAmount);
                if (pointsEarned > 0)
                {
                    var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == pushed.CustomerId);
                    if (loyaltyAccount is null)
                    {
                        loyaltyAccount = new LoyaltyAccount { CustomerId = pushed.CustomerId.Value };
                        db.LoyaltyAccounts.Add(loyaltyAccount);
                    }
                    loyaltyAccount.PointsBalance += pointsEarned;
                }
            }

            foreach (var movement in pushed.StockMovements)
            {
                if (await db.StockMovements.AnyAsync(m => m.Id == movement.Id))
                    continue;

                db.StockMovements.Add(new StockMovement
                {
                    Id = movement.Id,
                    ProductId = movement.ProductId,
                    BatchId = movement.BatchId,
                    LocationId = movement.LocationId,
                    DestinationLocationId = movement.DestinationLocationId,
                    Type = movement.Type,
                    QuantityInBaseUnits = movement.QuantityInBaseUnits,
                    Reason = movement.Reason,
                    UserId = movement.UserId,
                    Timestamp = movement.Timestamp,
                });

                // Apply the quantity directly rather than re-deriving FEFO —
                // the device already decided which batch(es) to deduct from
                // and that's what's printed on the receipt; re-running FEFO
                // here could disagree with it and corrupt the audit trail.
                // Do NOT "fix" this to call StockDeductionService.DeductFefoAsync.
                //
                // Negative resulting stock is allowed by design (no floor
                // check) — two offline devices at the same location can both
                // deduct from the same batch before either syncs; per the
                // conflict policy, neither sale is ever blocked or dropped,
                // and the resulting negative stock surfaces on the Dashboard
                // for manual reconciliation instead.
                if (movement.BatchId is { } batchId)
                {
                    var batch = await db.Batches.FindAsync(batchId);
                    if (batch is not null)
                        batch.QuantityInBaseUnits += movement.QuantityInBaseUnits;
                    // Missing batch (stale device cache): the movement row
                    // above still preserves the audit trail even though no
                    // quantity could be adjusted.
                }
            }

            db.Sales.Add(sale);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return new SyncPushResult(pushed.Id, true, null);
        }
        catch (Exception)
        {
            await transaction.RollbackAsync();
            return new SyncPushResult(pushed.Id, false, "Erreur lors de l'application de la vente.");
        }
    }

    private static async Task<SyncPushResult> ApplyShiftOpenAsync(PharmaStockDbContext db, Guid companyId, SyncPushShiftOpen pushed)
    {
        if (await db.CashRegisterShifts.AnyAsync(s => s.Id == pushed.Id))
            return new SyncPushResult(pushed.Id, true, null);

        var locationOk = await db.Locations.AnyAsync(l => l.Id == pushed.LocationId && l.CompanyId == companyId);
        if (!locationOk)
            return new SyncPushResult(pushed.Id, false, "Emplacement introuvable.");

        var shift = new CashRegisterShift
        {
            Id = pushed.Id,
            CompanyId = companyId,
            LocationId = pushed.LocationId,
            OpenedByUserId = pushed.OpenedByUserId,
            OpeningCashAmount = pushed.OpeningCashAmount,
            OpenedAt = pushed.OpenedAt,
            SyncStatus = SyncStatus.Synced,
        };

        db.CashRegisterShifts.Add(shift);
        try
        {
            await db.SaveChangesAsync();
            return new SyncPushResult(pushed.Id, true, null);
        }
        catch (DbUpdateException)
        {
            // The partial unique index (one open shift per location) means
            // two offline devices opening a shift at the same location
            // collide here. Never drop the losing shift silently: insert it
            // already closed, preserving every Sale.ShiftId FK that
            // referenced it during the offline period, and flag it for the
            // same admin-alert path as negative stock (Dashboard).
            db.ChangeTracker.Clear();
            shift = new CashRegisterShift
            {
                Id = pushed.Id,
                CompanyId = companyId,
                LocationId = pushed.LocationId,
                OpenedByUserId = pushed.OpenedByUserId,
                OpeningCashAmount = pushed.OpeningCashAmount,
                OpenedAt = pushed.OpenedAt,
                Status = ShiftStatus.Closed,
                ClosedAt = pushed.OpenedAt,
                ClosingNotes = $"{DashboardEndpoints.ShiftConflictMarker} sur un autre appareil.",
                SyncStatus = SyncStatus.Synced,
            };
            db.CashRegisterShifts.Add(shift);
            await db.SaveChangesAsync();
            return new SyncPushResult(pushed.Id, true, "Auto-fermée : conflit avec une caisse ouverte simultanément.");
        }
    }

    private static async Task<SyncPushResult> ApplyShiftCloseAsync(PharmaStockDbContext db, Guid companyId, SyncPushShiftClose pushed)
    {
        var shift = await db.CashRegisterShifts.FirstOrDefaultAsync(s => s.Id == pushed.ShiftId && s.CompanyId == companyId);
        if (shift is null)
            return new SyncPushResult(pushed.ShiftId, false, "Caisse introuvable.");
        if (shift.Status == ShiftStatus.Closed)
            return new SyncPushResult(pushed.ShiftId, true, null);

        var cashTotal = await ComputeShiftCashTotalAsync(db, shift.Id);

        shift.Status = ShiftStatus.Closed;
        shift.ClosedAt = pushed.ClosedAt;
        shift.ClosedByUserId = pushed.ClosedByUserId;
        shift.ClosingCashAmount = pushed.ClosingCashAmount;
        shift.ExpectedCashAmount = shift.OpeningCashAmount + cashTotal;
        shift.Discrepancy = pushed.ClosingCashAmount - shift.ExpectedCashAmount;
        shift.ClosingNotes = pushed.ClosingNotes;

        await db.SaveChangesAsync();
        return new SyncPushResult(pushed.ShiftId, true, null);
    }

    // Mirrors ShiftEndpoints.ComputeCashTotalAsync exactly (kept as a
    // separate copy rather than shared, since the two endpoints' request
    // shapes and transaction boundaries differ enough that sharing would
    // need its own abstraction — not worth it for one small aggregate query).
    private static async Task<decimal> ComputeShiftCashTotalAsync(PharmaStockDbContext db, Guid shiftId)
    {
        var directCash = await db.Sales
            .Where(s => s.ShiftId == shiftId && s.PaymentMethod == PaymentMethod.Cash)
            .SumAsync(s => (decimal?)s.Total) ?? 0m;

        var splitCash = await db.PaymentSplits
            .Where(p => p.Sale!.ShiftId == shiftId && p.Method == PaymentMethod.Cash)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        return directCash + splitCash;
    }
}
