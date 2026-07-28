using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;
using PharmaStock.Infrastructure.Services;

namespace PharmaStock.Desktop.Services;

/// <summary>Section 6 — local-first replacement for PharmaStockApiClient's
/// sale-creation calls: reimplements SaleEndpoints.cs's POST /sales and
/// /sales/hold transaction bodies against the local SQLite database via
/// StockDeductionService (unmodified — see its provider branch), so checkout
/// works with zero network. Every Sale/SaleLine/StockMovement created here
/// keeps the exact same client-generated Guid Ids sync push (Step 5/6) later
/// sends to the server, and is marked SyncStatus.PendingPush until then.</summary>
public class LocalSalesService
{
    private readonly IDbContextFactory<PharmaStockDbContext> _dbFactory;
    private readonly SessionService _session;
    private readonly LocalDbWriteLock _writeLock;

    public LocalSalesService(IDbContextFactory<PharmaStockDbContext> dbFactory, SessionService session, LocalDbWriteLock writeLock)
    {
        _dbFactory = dbFactory;
        _session = session;
        _writeLock = writeLock;
    }

    public Task<SaleResponse> CreateSaleAsync(Guid companyId, CreateSaleRequest request, CancellationToken ct = default)
        => _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);
            var deductor = new StockDeductionService(db);

            var productLines = request.ProductLines ?? new List<SaleLineRequest>();
            if (productLines.Count == 0)
                throw new PharmaStockApiException(400, "Une vente doit contenir au moins une ligne de produit.");
            if (productLines.Any(l => l.Quantity <= 0))
                throw new PharmaStockApiException(400, "Les quantités des lignes doivent être positives.");

            var company = await db.Companies.FindAsync(new object?[] { companyId }, ct);
            if (company is null)
                throw new PharmaStockApiException(404, "Entreprise introuvable localement — synchronisez avant de continuer hors-ligne.");

            if (request.CustomerId is { } customerId)
            {
                var customerExists = await db.Customers.AnyAsync(c => c.Id == customerId && c.CompanyId == companyId, ct);
                if (!customerExists)
                    throw new PharmaStockApiException(404, "Client introuvable.");
            }

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId, ct);
            if (!locationExists)
                throw new PharmaStockApiException(404, "Emplacement introuvable.");

            await using var transaction = await db.Database.BeginTransactionAsync(ct);

            var openShiftId = await db.CashRegisterShifts
                .Where(s => s.LocationId == request.LocationId && s.Status == ShiftStatus.Open)
                .Select(s => (Guid?)s.Id)
                .FirstOrDefaultAsync(ct);

            var userId = _session.UserId ?? throw new PharmaStockApiException(401, "Session locale introuvable.");

            var sale = new Sale
            {
                CompanyId = companyId,
                LocationId = request.LocationId,
                UserId = userId,
                CustomerId = request.CustomerId,
                PaymentMethod = request.PaymentMethod,
                ShiftId = openShiftId,
                SyncStatus = SyncStatus.PendingPush,
            };

            var saleLineResponses = new List<SaleLineResponse>();

            try
            {
                foreach (var line in productLines)
                {
                    var product = await db.Products
                        .Include(p => p.PackagingLevels)
                        .FirstOrDefaultAsync(p => p.Id == line.ProductId && p.CompanyId == companyId && p.IsActive, ct);
                    if (product is null)
                        throw new PharmaStockApiException(404, $"Produit {line.ProductId} introuvable.");

                    ProductPackagingLevel? level = null;
                    if (line.PackagingLevelId.HasValue)
                    {
                        level = product.PackagingLevels.FirstOrDefault(l => l.Id == line.PackagingLevelId);
                        if (level is null)
                            throw new PharmaStockApiException(400, $"Le niveau d'emballage {line.PackagingLevelId} n'appartient pas au produit {product.Id}.");
                    }

                    var unitsPerRequestedQuantity = level?.QuantityInBaseUnits ?? 1;
                    var quantityInBaseUnits = line.Quantity * unitsPerRequestedQuantity;
                    var unitPrice = level is null
                        ? product.SalePrice
                        : (level.SalePriceOverride ?? product.SalePrice * level.QuantityInBaseUnits) / level.QuantityInBaseUnits;
                    var taxRatePercent = product.TaxRateOverridePercent ?? company.DefaultTaxRatePercent;

                    List<StockDeductionResult> deductions;
                    try
                    {
                        deductions = await deductor.DeductFefoAsync(product.Id, request.LocationId, quantityInBaseUnits, ct);
                    }
                    catch (InsufficientStockException ex)
                    {
                        // Rollback happens once, uniformly, in the outer
                        // catch below — rolling back here too would try to
                        // roll back an already-completed SqliteTransaction,
                        // throwing "This SqliteTransaction has completed;
                        // it is no longer usable." in place of this message.
                        throw new PharmaStockApiException(409,
                            $"Stock insuffisant pour « {product.Name} » : {ex.Requested} unités de base demandées, {ex.Available} disponibles.");
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
                            UserId = userId,
                        });

                        var batch = await db.Batches.FindAsync(new object?[] { deduction.BatchId }, ct);
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

                sale.Total = saleLineResponses.Sum(l => l.LineTotal);

                var paymentSplitResponses = new List<PaymentSplitResponse>();
                if (request.PaymentSplits is { Count: > 0 })
                {
                    var splitTotal = request.PaymentSplits.Sum(s => s.Amount);
                    if (splitTotal != sale.Total)
                    {
                        throw new PharmaStockApiException(400,
                            $"Le total des paiements fractionnés {splitTotal} ne correspond pas au total de la vente {sale.Total}.");
                    }

                    sale.PaymentMethod = PaymentMethod.Split;
                    foreach (var split in request.PaymentSplits)
                    {
                        sale.PaymentSplits.Add(new PaymentSplit { Method = split.Method, Amount = split.Amount });
                        paymentSplitResponses.Add(new PaymentSplitResponse(split.Method, split.Amount));
                    }
                }

                if (request.AmountTendered is { } tendered)
                {
                    if (tendered < 0)
                    {
                        throw new PharmaStockApiException(400, "Le montant reçu ne peut pas être négatif.");
                    }

                    var cashOwed = request.PaymentSplits is { Count: > 0 }
                        ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.Cash).Sum(s => s.Amount)
                        : (request.PaymentMethod == PaymentMethod.Cash ? sale.Total : 0m);

                    if (cashOwed <= 0)
                    {
                        throw new PharmaStockApiException(400, "Un montant reçu a été fourni mais cette vente ne comporte pas de part en espèces.");
                    }

                    if (tendered < cashOwed)
                    {
                        throw new PharmaStockApiException(400, $"Montant reçu insuffisant : {tendered} reçu pour {cashOwed} dû en espèces.");
                    }

                    sale.AmountTendered = tendered;
                    sale.ChangeDue = tendered - cashOwed;
                }

                var creditAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.Credit).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.Credit ? sale.Total : 0m);
                if (creditAmount > 0)
                {
                    if (request.CustomerId is null)
                    {
                        throw new PharmaStockApiException(400, "Une vente à crédit nécessite un client.");
                    }
                    var customer = await db.Customers.FindAsync(new object?[] { request.CustomerId.Value }, ct);
                    customer!.CreditBalance += creditAmount;
                }

                // Mirrors SaleEndpoints.cs's GiftCard/StoreCredit/loyalty
                // blocks exactly (see its comments for the "why") — gift
                // cards and loyalty accounts sync down to this device the
                // same way Customers already do (see SyncService.PullAsync),
                // so a redemption here is validated against the last-synced
                // balance and applied optimistically, then re-derived and
                // re-applied server-side from Sale.GiftCardCode/Total when
                // this sale eventually pushes — exactly how CreditBalance
                // above already works offline-first.
                var giftCardAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.GiftCard).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.GiftCard ? sale.Total : 0m);
                if (giftCardAmount > 0)
                {
                    if (string.IsNullOrWhiteSpace(request.GiftCardCode))
                        throw new PharmaStockApiException(400, "Un paiement par carte-cadeau nécessite un code de carte.");

                    var normalizedCode = request.GiftCardCode.Trim().ToUpperInvariant();
                    var giftCard = await db.GiftCards.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.Code == normalizedCode, ct);
                    if (giftCard is null)
                        throw new PharmaStockApiException(404, "Carte-cadeau introuvable.");
                    if (!giftCard.Active)
                        throw new PharmaStockApiException(400, "Cette carte-cadeau est désactivée.");
                    if (giftCard.RemainingValue < giftCardAmount)
                        throw new PharmaStockApiException(400, $"Solde de la carte-cadeau insuffisant : {giftCard.RemainingValue} disponible.");

                    giftCard.RemainingValue -= giftCardAmount;
                    sale.GiftCardCode = normalizedCode;
                }

                var storeCreditAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.StoreCredit).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.StoreCredit ? sale.Total : 0m);
                if (storeCreditAmount > 0)
                {
                    if (request.CustomerId is null)
                        throw new PharmaStockApiException(400, "Un paiement par crédit-magasin nécessite un client.");

                    var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == request.CustomerId, ct);
                    if (loyaltyAccount is null || loyaltyAccount.StoreCreditBalance < storeCreditAmount)
                        throw new PharmaStockApiException(400, $"Solde de crédit-magasin insuffisant : {loyaltyAccount?.StoreCreditBalance ?? 0} disponible.");

                    loyaltyAccount.StoreCreditBalance -= storeCreditAmount;
                }

                if (company.LoyaltyEnabled && request.CustomerId is not null && sale.Total > 0)
                {
                    var pointsEarned = (int)Math.Floor(sale.Total / company.LoyaltyEarnRateAmount);
                    if (pointsEarned > 0)
                    {
                        var loyaltyAccount = await db.LoyaltyAccounts.FirstOrDefaultAsync(l => l.CustomerId == request.CustomerId, ct);
                        if (loyaltyAccount is null)
                        {
                            loyaltyAccount = new LoyaltyAccount { CustomerId = request.CustomerId.Value };
                            db.LoyaltyAccounts.Add(loyaltyAccount);
                        }
                        loyaltyAccount.PointsBalance += pointsEarned;
                    }
                }

                db.Sales.Add(sale);
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);

                return new SaleResponse(
                    sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                    saleLineResponses, Enumerable.Empty<object>(), paymentSplitResponses,
                    sale.AmountTendered, sale.ChangeDue);
            }
            catch
            {
                await transaction.RollbackAsync(ct);
                throw;
            }
        }, ct);

    // Mirrors SaleEndpoints.cs's /sales/hold — no stock impact at all, same
    // as the online path: FEFO deduction only happens for real once the cart
    // is resumed and actually checked out (a call to CreateSaleAsync above).
    public Task<SaleResponse> HoldSaleAsync(Guid companyId, HoldSaleRequest request, CancellationToken ct = default)
        => _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);

            if (request.ProductLines.Count == 0)
                throw new PharmaStockApiException(400, "Une vente doit contenir au moins une ligne de produit.");
            if (request.ProductLines.Any(l => l.Quantity <= 0))
                throw new PharmaStockApiException(400, "Les quantités des lignes doivent être positives.");

            var company = await db.Companies.FindAsync(new object?[] { companyId }, ct);
            if (company is null)
                throw new PharmaStockApiException(404, "Entreprise introuvable localement — synchronisez avant de continuer hors-ligne.");

            var locationExists = await db.Locations.AnyAsync(l => l.Id == request.LocationId && l.CompanyId == companyId, ct);
            if (!locationExists)
                throw new PharmaStockApiException(404, "Emplacement introuvable.");

            var userId = _session.UserId ?? throw new PharmaStockApiException(401, "Session locale introuvable.");

            var sale = new Sale
            {
                CompanyId = companyId,
                LocationId = request.LocationId,
                UserId = userId,
                CustomerId = request.CustomerId,
                Status = SaleStatus.Held,
                SyncStatus = SyncStatus.PendingPush,
            };

            var saleLineResponses = new List<SaleLineResponse>();
            foreach (var line in request.ProductLines)
            {
                var product = await db.Products
                    .Include(p => p.PackagingLevels)
                    .FirstOrDefaultAsync(p => p.Id == line.ProductId && p.CompanyId == companyId && p.IsActive, ct);
                if (product is null)
                    throw new PharmaStockApiException(404, $"Produit {line.ProductId} introuvable.");

                ProductPackagingLevel? level = null;
                if (line.PackagingLevelId.HasValue)
                {
                    level = product.PackagingLevels.FirstOrDefault(l => l.Id == line.PackagingLevelId);
                    if (level is null)
                        throw new PharmaStockApiException(400, $"Le niveau d'emballage {line.PackagingLevelId} n'appartient pas au produit {product.Id}.");
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
            await db.SaveChangesAsync(ct);

            return new SaleResponse(
                sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                saleLineResponses, Enumerable.Empty<object>(), Enumerable.Empty<PaymentSplitResponse>(),
                null, null);
        }, ct);

    public async Task<List<HeldSaleSummaryResponse>> GetHeldSalesAsync(Guid companyId, Guid? locationId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var query = db.Sales
            .Include(s => s.User)
            .Include(s => s.Location)
            .Where(s => s.CompanyId == companyId && s.Status == SaleStatus.Held);
        if (locationId is not null)
            query = query.Where(s => s.LocationId == locationId);

        var held = await query
            .OrderByDescending(s => s.Timestamp)
            .Select(s => new HeldSaleSummaryResponse(
                s.Id, s.Timestamp, s.Total, s.User!.Name, s.Location!.Name, s.ProductLines.Count + s.ServiceLines.Count))
            .ToListAsync(ct);

        return held;
    }

    public Task DeleteHeldSaleAsync(Guid companyId, Guid saleId, CancellationToken ct = default)
        => _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);
            var sale = await db.Sales.FirstOrDefaultAsync(s => s.Id == saleId && s.CompanyId == companyId, ct);
            if (sale is null)
                throw new PharmaStockApiException(404, "Vente introuvable.");
            if (sale.Status != SaleStatus.Held)
                throw new PharmaStockApiException(400, "Seule une vente en attente peut être supprimée.");

            db.Sales.Remove(sale);
            await db.SaveChangesAsync(ct);
        }, ct);

    public async Task<SaleDetailResponse> GetSaleDetailAsync(Guid companyId, Guid saleId, CancellationToken ct = default)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var sale = await db.Sales
            .Include(s => s.User)
            .Include(s => s.Location)
            .Include(s => s.ProductLines).ThenInclude(l => l.Product)
            .Include(s => s.ProductLines).ThenInclude(l => l.Batch)
            .Include(s => s.ProductLines).ThenInclude(l => l.PackagingLevel)
            .Include(s => s.PaymentSplits)
            .FirstOrDefaultAsync(s => s.Id == saleId && s.CompanyId == companyId, ct);

        if (sale is null)
            throw new PharmaStockApiException(404, "Vente introuvable.");

        var productLines = sale.ProductLines.Select(l => new SaleLineResponse(
            l.ProductId, l.Product!.Name, l.BatchId, l.Batch?.BatchNumber,
            l.QuantityInBaseUnits, l.PackagingLevelId, l.PackagingLevel?.UnitName, l.PackagingLevel?.QuantityInBaseUnits ?? 1, l.UnitPrice, l.TaxRatePercent,
            l.UnitPrice * l.QuantityInBaseUnits));

        var paymentSplits = sale.PaymentSplits.Select(p => new PaymentSplitResponse(p.Method, p.Amount));

        return new SaleDetailResponse(
            sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
            sale.User?.Name ?? "—", sale.Location?.Name ?? "—",
            productLines, Enumerable.Empty<object>(), paymentSplits,
            sale.AmountTendered, sale.ChangeDue);
    }
}
