using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;
using PharmaStock.Infrastructure.Services;

namespace PharmaStock.Api.Services;

public record SaleLineRequest(Guid ProductId, int Quantity, Guid? PackagingLevelId);
public record ServiceLineRequest(Guid ServiceId, int Quantity);
public record PaymentSplitRequest(PaymentMethod Method, decimal Amount);

public record CreateSaleRequest(
    Guid LocationId,
    Guid? CustomerId,
    PaymentMethod PaymentMethod,
    List<SaleLineRequest>? ProductLines,
    List<ServiceLineRequest>? ServiceLines,
    List<PaymentSplitRequest>? PaymentSplits,
    decimal? AmountTendered = null,
    string? GiftCardCode = null);

public record SaleLineResponse(
    Guid ProductId, string ProductName, Guid? BatchId, string? BatchNumber,
    int QuantityInBaseUnits, Guid? PackagingLevelId, string? PackagingLevelName, int UnitsPerPackagingLevel, decimal UnitPrice,
    decimal TaxRatePercent, decimal LineTotal);
public record ServiceLineResponse(Guid ServiceId, string ServiceName, int Quantity, decimal BilledPrice, decimal LineTotal);
public record PaymentSplitResponse(PaymentMethod Method, decimal Amount);

public record SaleResponse(
    Guid Id, decimal Total, PaymentMethod PaymentMethod, SaleStatus Status, DateTime Timestamp,
    IEnumerable<SaleLineResponse> ProductLines,
    IEnumerable<ServiceLineResponse> ServiceLines,
    IEnumerable<PaymentSplitResponse> PaymentSplits,
    decimal? AmountTendered, decimal? ChangeDue);

public record SaleSummaryResponse(Guid Id, DateTime Timestamp, decimal Total, PaymentMethod PaymentMethod, string CashierName, int ItemCount);
public record SaleHistoryPageResponse(List<SaleSummaryResponse> Items, bool HasMore);

// Held (parked) sales — Section 18.1. Deliberately no PaymentMethod/
// PaymentSplits/AmountTendered here: none of that has been decided yet at
// hold time, it's only chosen once the cashier actually resumes and checks
// the sale out (a brand-new POST /sales call, same as any other checkout).
public record HoldSaleRequest(Guid LocationId, Guid? CustomerId, List<SaleLineRequest> ProductLines);
public record HeldSaleSummaryResponse(Guid Id, DateTime Timestamp, decimal Total, string CashierName, string LocationName, int ItemCount);

// Same shape as SaleResponse plus the cashier/location names a printed
// receipt needs — SaleResponse itself stays lean since CreateSaleAsync's
// caller already knows who/where (it just made the request).
public record SaleDetailResponse(
    Guid Id, decimal Total, PaymentMethod PaymentMethod, SaleStatus Status, DateTime Timestamp,
    string CashierName, string LocationName,
    IEnumerable<SaleLineResponse> ProductLines,
    IEnumerable<ServiceLineResponse> ServiceLines,
    IEnumerable<PaymentSplitResponse> PaymentSplits,
    decimal? AmountTendered, decimal? ChangeDue);

public static class SaleEndpoints
{
    public static void MapSaleEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/sales", async (
            Guid companyId, CreateSaleRequest request, PharmaStockDbContext db,
            StockDeductionService deductor, HttpContext http) =>
        {
            var callerCompanyId = http.User.GetCompanyId();
            var callerUserId = http.User.GetUserId();
            if (callerCompanyId != companyId || callerUserId is null)
                return Results.Forbid();

            var productLines = request.ProductLines ?? new List<SaleLineRequest>();
            var serviceLines = request.ServiceLines ?? new List<ServiceLineRequest>();
            if (productLines.Count == 0 && serviceLines.Count == 0)
                return Results.BadRequest(new { message = "Une vente doit contenir au moins une ligne de produit ou de service." });
            if (productLines.Any(l => l.Quantity <= 0) || serviceLines.Any(l => l.Quantity <= 0))
                return Results.BadRequest(new { message = "Les quantités des lignes doivent être positives." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });
            if (serviceLines.Count > 0 && !company.ServicesModuleEnabled)
                return Results.BadRequest(new { message = "Le module Services n'est pas activé pour cette entreprise." });

            if (request.CustomerId.HasValue)
            {
                var customerExists = await db.Customers.AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId);
                if (!customerExists)
                    return Results.NotFound(new { message = "Client introuvable." });
            }

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            await using var transaction = await db.Database.BeginTransactionAsync();

            // Section 3.6 — best-effort association, never a blocker: a
            // company that doesn't open shifts just gets ShiftId == null on
            // every sale and checkout proceeds exactly as before.
            var openShift = await db.CashRegisterShifts
                .Where(s => s.LocationId == request.LocationId && s.Status == ShiftStatus.Open)
                .Select(s => (Guid?)s.Id)
                .FirstOrDefaultAsync();

            var sale = new Sale
            {
                CompanyId = companyId,
                LocationId = request.LocationId,
                UserId = callerUserId.Value,
                CustomerId = request.CustomerId,
                PaymentMethod = request.PaymentMethod,
                ShiftId = openShift,
            };

            var saleLineResponses = new List<SaleLineResponse>();
            var serviceLineResponses = new List<ServiceLineResponse>();

            try
            {
                foreach (var line in productLines)
                {
                    var product = await db.Products
                        .Include(p => p.PackagingLevels)
                        .FirstOrDefaultAsync(p => p.Id == line.ProductId && p.CompanyId == companyId && p.IsActive);
                    if (product is null)
                        return Results.NotFound(new { message = $"Produit {line.ProductId} introuvable." });

                    ProductPackagingLevel? level = null;
                    if (line.PackagingLevelId.HasValue)
                    {
                        level = product.PackagingLevels.FirstOrDefault(l => l.Id == line.PackagingLevelId);
                        if (level is null)
                            return Results.BadRequest(new { message = $"Le niveau d'emballage {line.PackagingLevelId} n'appartient pas au produit {product.Id}." });
                    }

                    var unitsPerRequestedQuantity = level?.QuantityInBaseUnits ?? 1;
                    var quantityInBaseUnits = line.Quantity * unitsPerRequestedQuantity;

                    // Price expressed per base unit regardless of packaging level, so
                    // LineTotal is always QuantityInBaseUnits * UnitPrice: a level's
                    // override (or the product's default) is divided across the
                    // base units it contains.
                    var unitPrice = level is null
                        ? product.SalePrice
                        : (level.SalePriceOverride ?? product.SalePrice * level.QuantityInBaseUnits) / level.QuantityInBaseUnits;

                    // Section 18.3 — snapshotted per line so a later rate
                    // change never rewrites tax on a past sale.
                    var taxRatePercent = product.TaxRateOverridePercent ?? company.DefaultTaxRatePercent;

                    List<StockDeductionResult> deductions;
                    try
                    {
                        deductions = await deductor.DeductFefoAsync(product.Id, request.LocationId, quantityInBaseUnits);
                    }
                    catch (InsufficientStockException ex)
                    {
                        await transaction.RollbackAsync();
                        return Results.Conflict(new
                        {
                            message = $"Stock insuffisant pour « {product.Name} » : {ex.Requested} unités de base demandées, {ex.Available} disponibles."
                        });
                    }

                    foreach (var deduction in deductions)
                    {
                        db.StockMovements.Add(new StockMovement
                        {
                            ProductId = product.Id,
                            BatchId = deduction.BatchId,
                            LocationId = request.LocationId,
                            Type = StockMovementType.Sale,
                            QuantityInBaseUnits = -deduction.QuantityInBaseUnits,
                            UserId = callerUserId.Value,
                        });

                        var batch = await db.Batches.FindAsync(deduction.BatchId);
                        sale.ProductLines.Add(new SaleLine
                        {
                            ProductId = product.Id,
                            BatchId = deduction.BatchId,
                            QuantityInBaseUnits = deduction.QuantityInBaseUnits,
                            PackagingLevelId = level?.Id,
                            UnitPrice = unitPrice,
                            TaxRatePercent = taxRatePercent,
                        });

                        saleLineResponses.Add(new SaleLineResponse(
                            product.Id, product.Name, deduction.BatchId, batch?.BatchNumber,
                            deduction.QuantityInBaseUnits, level?.Id, level?.UnitName, unitsPerRequestedQuantity, unitPrice, taxRatePercent,
                            unitPrice * deduction.QuantityInBaseUnits));
                    }
                }

                foreach (var line in serviceLines)
                {
                    var service = await db.Services
                        .Include(s => s.StockLinks)
                        .FirstOrDefaultAsync(s => s.Id == line.ServiceId && s.CompanyId == companyId && s.Active);
                    if (service is null)
                        return Results.NotFound(new { message = $"Service {line.ServiceId} introuvable." });

                    foreach (var stockLink in service.StockLinks)
                    {
                        var totalConsumed = stockLink.QuantityConsumedInBaseUnits * line.Quantity;
                        List<StockDeductionResult> deductions;
                        try
                        {
                            deductions = await deductor.DeductFefoAsync(stockLink.ProductId, request.LocationId, totalConsumed);
                        }
                        catch (InsufficientStockException ex)
                        {
                            await transaction.RollbackAsync();
                            return Results.Conflict(new
                            {
                                message = $"Stock insuffisant pour honorer le service « {service.Name} » : " +
                                    $"{ex.Requested} unités de base demandées, {ex.Available} disponibles."
                            });
                        }

                        foreach (var deduction in deductions)
                        {
                            db.StockMovements.Add(new StockMovement
                            {
                                ProductId = stockLink.ProductId,
                                BatchId = deduction.BatchId,
                                LocationId = request.LocationId,
                                Type = StockMovementType.ServiceConsumption,
                                QuantityInBaseUnits = -deduction.QuantityInBaseUnits,
                                UserId = callerUserId.Value,
                            });
                        }
                    }

                    sale.ServiceLines.Add(new ServiceLine
                    {
                        ServiceId = service.Id,
                        BilledPrice = service.FixedPrice,
                        Quantity = line.Quantity,
                    });
                    serviceLineResponses.Add(new ServiceLineResponse(
                        service.Id, service.Name, line.Quantity, service.FixedPrice, service.FixedPrice * line.Quantity));
                }

                sale.Total = saleLineResponses.Sum(l => l.LineTotal) + serviceLineResponses.Sum(l => l.LineTotal);

                var paymentSplitResponses = new List<PaymentSplitResponse>();
                if (request.PaymentSplits is { Count: > 0 })
                {
                    var splitTotal = request.PaymentSplits.Sum(s => s.Amount);
                    if (splitTotal != sale.Total)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new
                        {
                            message = $"Le total des paiements fractionnés {splitTotal.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                                $"ne correspond pas au total de la vente {sale.Total.ToString(System.Globalization.CultureInfo.InvariantCulture)}."
                        });
                    }

                    sale.PaymentMethod = PaymentMethod.Split;
                    foreach (var split in request.PaymentSplits)
                    {
                        sale.PaymentSplits.Add(new PaymentSplit { Method = split.Method, Amount = split.Amount });
                        paymentSplitResponses.Add(new PaymentSplitResponse(split.Method, split.Amount));
                    }
                }

                // Section 3.1 cashier aid — cash tendered/change due is purely
                // descriptive bookkeeping about physical cash handling: it
                // never changes sale.Total or the (already-validated-above)
                // split amounts, since a customer's change nets out to
                // exactly what's owed regardless of how much they handed over.
                if (request.AmountTendered is { } tendered)
                {
                    if (tendered < 0)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Le montant reçu ne peut pas être négatif." });
                    }

                    var cashOwed = request.PaymentSplits is { Count: > 0 }
                        ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.Cash).Sum(s => s.Amount)
                        : (request.PaymentMethod == PaymentMethod.Cash ? sale.Total : 0m);

                    if (cashOwed <= 0)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Un montant reçu a été fourni mais cette vente ne comporte pas de part en espèces." });
                    }

                    if (tendered < cashOwed)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new
                        {
                            message = $"Montant reçu insuffisant : {tendered.ToString(System.Globalization.CultureInfo.InvariantCulture)} reçu pour " +
                                $"{cashOwed.ToString(System.Globalization.CultureInfo.InvariantCulture)} dû en espèces."
                        });
                    }

                    sale.AmountTendered = tendered;
                    sale.ChangeDue = tendered - cashOwed;
                }

                // Section 3.5 — a Credit sale (whole or split) increases the
                // customer's running debt; it is not itself a stock or cash movement.
                var creditAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.Credit).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.Credit ? sale.Total : 0m);
                if (creditAmount > 0)
                {
                    if (request.CustomerId is null)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Une vente à crédit nécessite un client." });
                    }
                    var customer = await db.Customers.FindAsync(request.CustomerId.Value);
                    customer!.CreditBalance += creditAmount;
                }

                // Section 21.3 — a GiftCard sale (whole or split) draws down
                // the redeemed card's prepaid balance. The code travels with
                // the sale itself (Sale.GiftCardCode) so a receipt/history
                // view can show which card paid for it, and so sync push
                // carries it along for the server to re-derive this same
                // amount when a locally-created sale eventually syncs.
                var giftCardAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.GiftCard).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.GiftCard ? sale.Total : 0m);
                if (giftCardAmount > 0)
                {
                    if (string.IsNullOrWhiteSpace(request.GiftCardCode))
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Un paiement par carte-cadeau nécessite un code de carte." });
                    }

                    var normalizedCode = request.GiftCardCode.Trim().ToUpperInvariant();
                    var giftCard = await db.GiftCards.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.Code == normalizedCode);
                    if (giftCard is null)
                    {
                        await transaction.RollbackAsync();
                        return Results.NotFound(new { message = "Carte-cadeau introuvable." });
                    }
                    if (!giftCard.Active)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Cette carte-cadeau est désactivée." });
                    }
                    if (giftCard.RemainingValue < giftCardAmount)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = $"Solde de la carte-cadeau insuffisant : {giftCard.RemainingValue} disponible." });
                    }

                    giftCard.RemainingValue -= giftCardAmount;
                    sale.GiftCardCode = normalizedCode;
                }

                // Section 21.3 — a StoreCredit sale (whole or split) draws
                // down the customer's LoyaltyAccount.StoreCreditBalance,
                // built up by earlier point redemptions (see LoyaltyEndpoints).
                var storeCreditAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.StoreCredit).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.StoreCredit ? sale.Total : 0m);
                if (storeCreditAmount > 0)
                {
                    if (request.CustomerId is null)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "Un paiement par crédit-magasin nécessite un client." });
                    }

                    var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == request.CustomerId);
                    if (loyaltyAccount is null || loyaltyAccount.StoreCreditBalance < storeCreditAmount)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = $"Solde de crédit-magasin insuffisant : {loyaltyAccount?.StoreCreditBalance ?? 0} disponible." });
                    }

                    loyaltyAccount.StoreCreditBalance -= storeCreditAmount;
                }

                // Section 21.3 — every sale attributed to a customer earns
                // loyalty points, independent of payment method (even a
                // Credit or StoreCredit sale still earns) — floor division
                // means a sale smaller than LoyaltyEarnRateAmount earns
                // nothing rather than a fractional point.
                if (company.LoyaltyEnabled && request.CustomerId is not null && sale.Total > 0)
                {
                    var pointsEarned = (int)Math.Floor(sale.Total / company.LoyaltyEarnRateAmount);
                    if (pointsEarned > 0)
                    {
                        var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == request.CustomerId);
                        if (loyaltyAccount is null)
                        {
                            loyaltyAccount = new LoyaltyAccount { CustomerId = request.CustomerId.Value };
                            db.LoyaltyAccounts.Add(loyaltyAccount);
                        }
                        loyaltyAccount.PointsBalance += pointsEarned;
                    }
                }

                db.Sales.Add(sale);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Results.Created($"/api/companies/{companyId}/sales/{sale.Id}", new SaleResponse(
                    sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                    saleLineResponses, serviceLineResponses, paymentSplitResponses,
                    sale.AmountTendered, sale.ChangeDue));
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }).RequireAuthorization();

        // Section 18.1 — parks a cart without touching stock at all: no FEFO
        // deduction, no StockMovement rows, SaleLine.BatchId stays null. Batch
        // assignment only happens for real once the cashier actually resumes
        // and checks out (a normal POST /sales call) — holding a cart never
        // reserves stock against it, so two cashiers can't accidentally block
        // each other over an item sitting in a parked cart.
        app.MapPost("/api/companies/{companyId:guid}/sales/hold", async (
            Guid companyId, HoldSaleRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var callerCompanyId = http.User.GetCompanyId();
            var callerUserId = http.User.GetUserId();
            if (callerCompanyId != companyId || callerUserId is null)
                return Results.Forbid();

            if (request.ProductLines.Count == 0)
                return Results.BadRequest(new { message = "Une vente doit contenir au moins une ligne de produit." });
            if (request.ProductLines.Any(l => l.Quantity <= 0))
                return Results.BadRequest(new { message = "Les quantités des lignes doivent être positives." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Entreprise introuvable." });

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId);
            if (!locationExists)
                return Results.NotFound(new { message = "Emplacement introuvable." });

            if (request.CustomerId.HasValue)
            {
                var customerExists = await db.Customers.AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId);
                if (!customerExists)
                    return Results.NotFound(new { message = "Client introuvable." });
            }

            var sale = new Sale
            {
                CompanyId = companyId,
                LocationId = request.LocationId,
                UserId = callerUserId.Value,
                CustomerId = request.CustomerId,
                Status = SaleStatus.Held,
            };

            var saleLineResponses = new List<SaleLineResponse>();
            foreach (var line in request.ProductLines)
            {
                var product = await db.Products
                    .Include(p => p.PackagingLevels)
                    .FirstOrDefaultAsync(p => p.Id == line.ProductId && p.CompanyId == companyId && p.IsActive);
                if (product is null)
                    return Results.NotFound(new { message = $"Produit {line.ProductId} introuvable." });

                ProductPackagingLevel? level = null;
                if (line.PackagingLevelId.HasValue)
                {
                    level = product.PackagingLevels.FirstOrDefault(l => l.Id == line.PackagingLevelId);
                    if (level is null)
                        return Results.BadRequest(new { message = $"Le niveau d'emballage {line.PackagingLevelId} n'appartient pas au produit {product.Id}." });
                }

                var unitsPerRequestedQuantity = level?.QuantityInBaseUnits ?? 1;
                var quantityInBaseUnits = line.Quantity * unitsPerRequestedQuantity;
                var unitPrice = level is null
                    ? product.SalePrice
                    : (level.SalePriceOverride ?? product.SalePrice * level.QuantityInBaseUnits) / level.QuantityInBaseUnits;
                var taxRatePercent = product.TaxRateOverridePercent ?? company.DefaultTaxRatePercent;

                sale.ProductLines.Add(new SaleLine
                {
                    ProductId = product.Id,
                    BatchId = null,
                    QuantityInBaseUnits = quantityInBaseUnits,
                    PackagingLevelId = level?.Id,
                    UnitPrice = unitPrice,
                    TaxRatePercent = taxRatePercent,
                });

                saleLineResponses.Add(new SaleLineResponse(
                    product.Id, product.Name, null, null,
                    quantityInBaseUnits, level?.Id, level?.UnitName, unitsPerRequestedQuantity, unitPrice, taxRatePercent,
                    unitPrice * quantityInBaseUnits));
            }

            sale.Total = saleLineResponses.Sum(l => l.LineTotal);

            db.Sales.Add(sale);
            await db.SaveChangesAsync();

            return Results.Created($"/api/companies/{companyId}/sales/{sale.Id}", new SaleResponse(
                sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                saleLineResponses, Enumerable.Empty<ServiceLineResponse>(), Enumerable.Empty<PaymentSplitResponse>(),
                null, null));
        }).RequireAuthorization();

        // locationId is optional: the POS "Reprendre" picker always passes its
        // own location (a cashier can only usefully resume a cart parked at
        // the till they're standing at), while the Held Sales management
        // screen omits it to browse across every branch. from/to mirror the
        // completed-sales history endpoint below — omitted entirely, this
        // returns every held sale ever parked and not yet resumed/discarded,
        // which the POS picker relies on (it never filters by date).
        app.MapGet("/api/companies/{companyId:guid}/sales/held", async (
            Guid companyId, Guid? locationId, DateTime? from, DateTime? to, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var query = db.Sales.Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Held);
            if (locationId is not null)
                query = query.Where(s => s.LocationId == locationId);
            if (from is not null)
                query = query.Where(s => s.Timestamp >= from.Value.Date);
            if (to is not null)
                query = query.Where(s => s.Timestamp < to.Value.Date.AddDays(1));

            var held = await query
                .OrderByDescending(s => s.Timestamp)
                .Select(s => new HeldSaleSummaryResponse(
                    s.Id, s.Timestamp, s.Total, s.User!.Name, s.Location!.Name, s.ProductLines.Count + s.ServiceLines.Count))
                .ToListAsync();

            return Results.Ok(held);
        }).RequireAuthorization();

        // Deliberately restricted to Held sales only — a Completed sale is a
        // financial/audit record and must never be deletable through this
        // route (or any route); refunds/voids are a separate concern this
        // doesn't implement yet.
        app.MapDelete("/api/companies/{companyId:guid}/sales/{saleId:guid}", async (
            Guid companyId, Guid saleId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var sale = await db.Sales.FirstOrDefaultAsync(s => s.Id == saleId && s.CompanyId == companyId);
            if (sale is null)
                return Results.NotFound(new { message = "Vente introuvable." });
            if (sale.Status != SaleStatus.Held)
                return Results.BadRequest(new { message = "Seule une vente en attente peut être supprimée." });

            db.Sales.Remove(sale);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/sales", async (
            Guid companyId, int? page, DateTime? from, DateTime? to, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            // RestrictReportsAndFullSales doesn't Forbid this endpoint — it
            // silently narrows it. A restricted Cashier still needs their own
            // sales history (e.g. to reprint a receipt), just never anyone
            // else's. Always derived from the caller's own fresh DB row, never
            // a client-supplied flag; CompanyAdmin/SuperAdmin always see
            // everything, same exemption as every other restriction check.
            var caller = await http.GetCallerAsync(db);
            if (caller is null)
                return Results.Unauthorized();

            var callerRole = http.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var scopeToOwnSales = callerRole != nameof(UserRole.CompanyAdmin) && callerRole != nameof(UserRole.SuperAdmin)
                && caller.RestrictReportsAndFullSales;

            var pageNumber = page is > 0 ? page.Value : 1;

            // from/to are date-only (e.g. "2026-07-01") from the client's date
            // pickers, compared directly against UTC Timestamp — the same
            // known UTC/Cameroon(UTC+1) simplification DashboardEndpoints
            // already makes, off by up to an hour around local midnight.
            // Held sales are deliberately excluded — this is a history of what
            // was actually sold, not of every cart that was ever started.
            var query = db.Sales.Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Completed);
            if (scopeToOwnSales)
                query = query.Where(s => s.UserId == caller.Id);
            if (from is not null)
                query = query.Where(s => s.Timestamp >= from.Value.Date);
            if (to is not null)
                query = query.Where(s => s.Timestamp < to.Value.Date.AddDays(1));

            var sales = await query
                .OrderByDescending(s => s.Timestamp)
                .Skip((pageNumber - 1) * SalesHistoryPageSize)
                .Take(SalesHistoryPageSize + 1)
                .Select(s => new SaleSummaryResponse(
                    s.Id, s.Timestamp, s.Total, s.PaymentMethod,
                    s.User!.Name, s.ProductLines.Count + s.ServiceLines.Count))
                .ToListAsync();

            var hasMore = sales.Count > SalesHistoryPageSize;
            return Results.Ok(new SaleHistoryPageResponse(sales.Take(SalesHistoryPageSize).ToList(), hasMore));
        }).RequireAuthorization();

        app.MapGet("/api/companies/{companyId:guid}/sales/{saleId:guid}", async (
            Guid companyId, Guid saleId, PharmaStockDbContext db, HttpContext http) =>
        {
            if (http.User.GetCompanyId() != companyId)
                return Results.Forbid();

            var sale = await db.Sales
                .Include(s => s.User)
                .Include(s => s.Location)
                .Include(s => s.ProductLines).ThenInclude(l => l.Product)
                .Include(s => s.ProductLines).ThenInclude(l => l.Batch)
                .Include(s => s.ProductLines).ThenInclude(l => l.PackagingLevel)
                .Include(s => s.ServiceLines).ThenInclude(l => l.Service)
                .Include(s => s.PaymentSplits)
                .FirstOrDefaultAsync(s => s.Id == saleId && s.CompanyId == companyId);

            if (sale is null)
                return Results.NotFound(new { message = "Vente introuvable." });

            var productLines = sale.ProductLines.Select(l => new SaleLineResponse(
                l.ProductId, l.Product!.Name, l.BatchId, l.Batch?.BatchNumber,
                l.QuantityInBaseUnits, l.PackagingLevelId, l.PackagingLevel?.UnitName, l.PackagingLevel?.QuantityInBaseUnits ?? 1, l.UnitPrice, l.TaxRatePercent,
                l.UnitPrice * l.QuantityInBaseUnits));

            var serviceLines = sale.ServiceLines.Select(l => new ServiceLineResponse(
                l.ServiceId, l.Service!.Name, l.Quantity, l.BilledPrice, l.BilledPrice * l.Quantity));

            var paymentSplits = sale.PaymentSplits.Select(p => new PaymentSplitResponse(p.Method, p.Amount));

            return Results.Ok(new SaleDetailResponse(
                sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                sale.User?.Name ?? "—", sale.Location?.Name ?? "—",
                productLines, serviceLines, paymentSplits,
                sale.AmountTendered, sale.ChangeDue));
        }).RequireAuthorization();
    }

    private const int SalesHistoryPageSize = 20;
}
