using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;
// MAUI's own Microsoft.Maui.Devices.Sensors.Location collides by name with
// our Domain entity — alias ours explicitly, same pattern as
// PharmaStockApiClient.cs's DevicePlatform alias.
using Location = PharmaStock.Domain.Models.Location;

namespace PharmaStock.Desktop.Services;

public record SyncResult(int SalesPushed, int SalesFailed, int RowsPulled, DateTime CompletedAt);

/// <summary>Section 6 — orchestrates offline-first sync: pushes this
/// device's locally-created (PendingPush) Sales/CashRegisterShifts to the
/// server, then pulls the server's latest catalog/stock state back down.
/// Always push-then-pull (see SyncNowAsync) — pulling first would fetch
/// Batch quantities that don't yet reflect this device's own not-yet-pushed
/// deductions.</summary>
public class SyncService
{
    private readonly IDbContextFactory<PharmaStockDbContext> _dbFactory;
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly LocalDbWriteLock _writeLock;

    private readonly SemaphoreSlim _syncGate = new(1, 1);
    private Task<SyncResult>? _inFlightSync;
    private CancellationTokenSource? _backgroundCts;
    private PeriodicTimer? _timer;

    public event EventHandler<SyncResult>? SyncCompleted;

    public SyncService(IDbContextFactory<PharmaStockDbContext> dbFactory, PharmaStockApiClient api, SessionService session, LocalDbWriteLock writeLock)
    {
        _dbFactory = dbFactory;
        _api = api;
        _session = session;
        _writeLock = writeLock;
    }

    public void StartBackgroundSync()
    {
        StopBackgroundSync();
        _backgroundCts = new CancellationTokenSource();
        var token = _backgroundCts.Token;

        Connectivity.Current.ConnectivityChanged += OnConnectivityChanged;

        // Sync immediately on start (e.g. right after login) rather than
        // waiting for the first periodic tick — a freshly-logged-in device
        // needs its local catalog populated before POS can be used at all,
        // offline or not.
        if (Connectivity.Current.NetworkAccess == NetworkAccess.Internet)
            _ = SyncNowAsync(token);

        _ = Task.Run(async () =>
        {
            _timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
            try
            {
                while (await _timer.WaitForNextTickAsync(token))
                {
                    if (Connectivity.Current.NetworkAccess == NetworkAccess.Internet)
                        await SyncNowAsync(token);
                }
            }
            catch (OperationCanceledException)
            {
                // StopBackgroundSync() was called — normal shutdown, not an error.
            }
        }, token);
    }

    public void StopBackgroundSync()
    {
        Connectivity.Current.ConnectivityChanged -= OnConnectivityChanged;
        _timer?.Dispose();
        _timer = null;
        _backgroundCts?.Cancel();
        _backgroundCts?.Dispose();
        _backgroundCts = null;
    }

    private CancellationTokenSource? _debounceCts;

    private void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e)
    {
        if (e.NetworkAccess != NetworkAccess.Internet) return;

        // Debounced ~3s so a flaky just-reconnected-then-dropped signal
        // doesn't fire a doomed sync attempt.
        _debounceCts?.Cancel();
        var cts = new CancellationTokenSource();
        _debounceCts = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(3000, cts.Token);
                await SyncNowAsync(cts.Token);
            }
            catch (OperationCanceledException) { }
        });
    }

    // Concurrent callers (e.g. PosPage bootstrapping its local cache right
    // as the just-started background sync from login is still running)
    // must await the SAME in-flight cycle rather than getting an instant
    // empty no-op back — a caller that actually needs the pull to have
    // happened (like PosPage resolving its Location) would otherwise see
    // "0 rows pulled" and wrongly conclude there's nothing to sync.
    public Task<SyncResult> SyncNowAsync(CancellationToken ct = default)
    {
        var existing = _inFlightSync;
        if (existing is { IsCompleted: false })
            return existing;

        var task = RunSyncAsync(ct);
        _inFlightSync = task;
        return task;
    }

    private async Task<SyncResult> RunSyncAsync(CancellationToken ct)
    {
        // Still guarded by the semaphore too (belt-and-suspenders): the
        // _inFlightSync check above has a tiny race window between reading
        // a completed task and starting a new one, and the timer/reconnect/
        // manual triggers all call in from different call sites.
        await _syncGate.WaitAsync(ct);

        try
        {
            var companyId = _session.CompanyId;
            if (companyId is null || !_session.IsLoggedIn)
                return new SyncResult(0, 0, 0, DateTime.UtcNow);

            // Bootstrap case: a fresh device has no LocationId yet (it's
            // normally learned from the local cache this same sync is about
            // to populate) — resolve it via the online API once, the one
            // step in this whole flow that can't be local-first by
            // definition, since there's nothing local to read yet.
            var locationId = _session.LocationId;
            if (locationId is null)
            {
                locationId = await ResolveLocationOnlineAsync(companyId.Value, ct);
                if (locationId is null)
                    return new SyncResult(0, 0, 0, DateTime.UtcNow);
            }

            var (pushed, failed) = await PushAsync(companyId.Value, ct);

            // If push failed to even reach the server, pulling now would just
            // apply against a state this device hasn't fully contributed to
            // yet — skip the pull this cycle rather than risk a momentarily
            // inconsistent local view; the next cycle retries both steps.
            var rowsPulled = 0;
            if (failed == 0)
            {
                try
                {
                    rowsPulled = await PullAsync(companyId.Value, locationId.Value, ct);
                }
                catch (PharmaStockApiException ex) when (ex.StatusCode == 404)
                {
                    // Stale LocationId (e.g. leftover from a previous
                    // company on this device, or the location was removed
                    // server-side) — self-heal by re-resolving online once
                    // and retrying, rather than failing silently forever.
                    locationId = await ResolveLocationOnlineAsync(companyId.Value, ct);
                    if (locationId is not null)
                        rowsPulled = await PullAsync(companyId.Value, locationId.Value, ct);
                }
            }

            var result = new SyncResult(pushed, failed, rowsPulled, DateTime.UtcNow);
            SyncCompleted?.Invoke(this, result);
            return result;
        }
        catch (PharmaStockApiException)
        {
            // No connectivity or server unreachable — silently skip, the
            // next trigger (timer/reconnect/manual) retries.
            return new SyncResult(0, 0, 0, DateTime.UtcNow);
        }
        catch (Exception)
        {
            // Anything else (e.g. a local EF/SQLite failure) must not
            // escape this method: most callers are fire-and-forget
            // (StartBackgroundSync's immediate/periodic/reconnect
            // triggers), and an unhandled exception there crashes the
            // whole app on Android — confirmed the hard way, there's no
            // platform-level catch-all like the WinUI one Windows has.
            return new SyncResult(0, 0, 0, DateTime.UtcNow);
        }
        finally
        {
            _syncGate.Release();
        }
    }

    // Only step in the whole sync flow that can't be local-first by
    // definition — needed to bootstrap a fresh device (no LocationId yet)
    // and to self-heal a stale one (e.g. left over from a previously
    // provisioned company on this same device).
    private async Task<Guid?> ResolveLocationOnlineAsync(Guid companyId, CancellationToken ct)
    {
        var locations = await _api.GetLocationsAsync(companyId, ct);
        var firstLocation = locations.FirstOrDefault();
        if (firstLocation is null) return null;

        _session.SaveLocationId(firstLocation.Id);
        return firstLocation.Id;
    }

    private async Task<(int pushed, int failed)> PushAsync(Guid companyId, CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);

        var pendingSales = await db.Sales
            .Include(s => s.ProductLines)
            .Include(s => s.PaymentSplits)
            .Where(s => s.CompanyId == companyId && s.SyncStatus == SyncStatus.PendingPush)
            .ToListAsync(ct);

        var pendingShifts = await db.CashRegisterShifts
            .Where(s => s.CompanyId == companyId && s.SyncStatus == SyncStatus.PendingPush)
            .ToListAsync(ct);

        if (pendingSales.Count == 0 && pendingShifts.Count == 0)
            return (0, 0);

        var salesPayload = pendingSales.Select(sale => new SyncPushSale(
            sale.Id, sale.LocationId, sale.UserId, sale.CustomerId, sale.ShiftId,
            sale.Total, sale.PaymentMethod, sale.Status, sale.AmountTendered, sale.ChangeDue, sale.Timestamp,
            sale.ProductLines.Select(l => new SyncPushSaleLine(
                l.Id, l.ProductId, l.BatchId, l.QuantityInBaseUnits, l.PackagingLevelId, l.UnitPrice, l.TaxRatePercent)).ToList(),
            new List<object>(),
            sale.PaymentSplits.Select(p => new SyncPushPaymentSplit(p.Id, p.Method, p.Amount)).ToList(),
            // Reconstructed from ProductLines rather than queried from
            // StockMovements directly: LocalSalesService adds exactly one
            // StockMovement per deducted SaleLine, in lockstep, so a line's
            // own BatchId/QuantityInBaseUnits already carries everything a
            // movement needs — no SaleId FK on StockMovement required.
            sale.ProductLines.Where(l => l.BatchId is not null).Select(l => new SyncPushStockMovement(
                Guid.NewGuid(), l.ProductId, l.BatchId, sale.LocationId, null, StockMovementType.Sale,
                -l.QuantityInBaseUnits, null, sale.UserId, sale.Timestamp)).ToList(),
            sale.GiftCardCode
        )).ToList();

        var shiftOpens = pendingShifts.Select(s => new SyncPushShiftOpen(
            s.Id, s.LocationId, s.OpenedByUserId, s.OpeningCashAmount, s.OpenedAt)).ToList();
        var shiftCloses = pendingShifts.Where(s => s.ClosedAt is not null).Select(s => new SyncPushShiftClose(
            s.Id, s.ClosedByUserId ?? s.OpenedByUserId, s.ClosingCashAmount ?? 0, s.ClosingNotes, s.ClosedAt!.Value)).ToList();

        var response = await _api.PushSyncAsync(companyId, new SyncPushRequest(_session.DeviceId, salesPayload, shiftOpens, shiftCloses), ct);

        var failed = 0;
        await _writeLock.RunAsync(async () =>
        {
            foreach (var result in response.SaleResults)
            {
                var sale = pendingSales.FirstOrDefault(s => s.Id == result.Id);
                if (sale is null) continue;
                if (result.Applied) sale.SyncStatus = SyncStatus.Synced;
                else failed++;
            }

            // A shift only counts as fully synced once every pushed aspect of
            // it (open, and close if applicable) is confirmed applied.
            foreach (var shift in pendingShifts)
            {
                var openOk = response.ShiftOpenResults.FirstOrDefault(r => r.Id == shift.Id)?.Applied ?? false;
                var closeResult = response.ShiftCloseResults.FirstOrDefault(r => r.Id == shift.Id);
                var closeOk = shift.ClosedAt is null || (closeResult?.Applied ?? false);
                if (openOk && closeOk) shift.SyncStatus = SyncStatus.Synced;
                else failed++;
            }

            await db.SaveChangesAsync(ct);
        }, ct);

        return (pendingSales.Count(s => s.SyncStatus == SyncStatus.Synced) + pendingShifts.Count(s => s.SyncStatus == SyncStatus.Synced), failed);
    }

    private async Task<int> PullAsync(Guid companyId, Guid locationId, CancellationToken ct)
    {
        var since = _session.LastSyncedAt;

        // Defensive: LastSyncedAt (Preferences) and the local SQLite cache
        // are two independent stores, and can disagree two ways:
        //   1. The db was wiped/recreated (fresh install, migration reset)
        //      without this watermark also being cleared.
        //   2. This device was previously used for a DIFFERENT company
        //      (e.g. re-provisioned, or — as hit during testing — repeated
        //      test-company creation on one device) — the cache isn't
        //      empty, it just holds another company's rows entirely, which
        //      an unscoped emptiness check would miss.
        // Either way, "incremental since X" would return almost nothing for
        // THIS company, leaving its slice of the cache empty forever.
        // Scope the check to this company specifically, not the table as a
        // whole, and force a full pull when it comes up empty.
        if (since is not null)
        {
            await using var checkDb = await _dbFactory.CreateDbContextAsync(ct);
            if (!await checkDb.Products.AnyAsync(p => p.CompanyId == companyId, ct))
                since = null;
        }

        var pull = await _api.PullSyncAsync(companyId, locationId, since, ct);

        var rowsPulled = await _writeLock.RunAsync(async () =>
        {
            await using var db = await _dbFactory.CreateDbContextAsync(ct);
            var count = 0;

            await UpsertCompanyAsync(db, companyId, pull.Company, ct);

            // Must land before Batches/StockMovements below: those rows
            // carry a required UserId FK, and SQLite enforces foreign keys
            // — a movement referencing a User this device has never cached
            // would otherwise fail the whole pull's SaveChanges.
            foreach (var user in pull.Users)
            {
                await UpsertAsync(db.Users, u => u.Id == user.Id, () => new User { Id = user.Id, CompanyId = companyId },
                    u => { u.Name = user.Name; u.Phone = user.Phone; }, ct);
                count++;
            }

            foreach (var loc in pull.Locations)
            {
                await UpsertAsync(db.Locations, l => l.Id == loc.Id, () => new Location { Id = loc.Id, CompanyId = companyId },
                    l => { l.Name = loc.Name; l.Address = loc.Address; l.Active = loc.Active; }, ct);
                count++;
            }

            foreach (var cat in pull.Categories)
            {
                await UpsertAsync(db.Categories, c => c.Id == cat.Id, () => new Category { Id = cat.Id, CompanyId = companyId },
                    c => { c.Name = cat.Name; c.UpdatedAt = cat.UpdatedAt; }, ct);
                count++;
            }

            foreach (var sup in pull.Suppliers)
            {
                await UpsertAsync(db.Suppliers, s => s.Id == sup.Id, () => new Supplier { Id = sup.Id, CompanyId = companyId },
                    s => { s.Name = sup.Name; s.ContactPhone = sup.ContactPhone; s.ContactEmail = sup.ContactEmail; s.UpdatedAt = sup.UpdatedAt; }, ct);
                count++;
            }

            foreach (var cust in pull.Customers)
            {
                var customer = await UpsertAsync(db.Customers, c => c.Id == cust.Id, () => new Customer { Id = cust.Id, CompanyId = companyId },
                    c => { c.Name = cust.Name; c.Phone = cust.Phone; c.CreditBalance = cust.CreditBalance; c.UpdatedAt = cust.UpdatedAt; }, ct);

                // LoyaltyAccount is a separate table (one-to-one, see
                // Customer.LoyaltyAccount's own doc comment) — upserted here
                // rather than via a top-level pull.LoyaltyAccounts list since
                // it's meaningless without its Customer and every pulled
                // Customer already carries its own current balances.
                await UpsertAsync(db.LoyaltyAccounts, l => l.CustomerId == customer.Id, () => new LoyaltyAccount { CustomerId = customer.Id },
                    l => { l.PointsBalance = cust.LoyaltyPointsBalance; l.StoreCreditBalance = cust.LoyaltyStoreCreditBalance; }, ct);
                count++;
            }

            foreach (var card in pull.GiftCards)
            {
                await UpsertAsync(db.GiftCards, g => g.Id == card.Id, () => new GiftCard { Id = card.Id, CompanyId = companyId },
                    g => { g.Code = card.Code; g.InitialValue = card.InitialValue; g.RemainingValue = card.RemainingValue; g.Active = card.Active; }, ct);
                count++;
            }

            foreach (var prod in pull.Products)
            {
                var product = await UpsertAsync(db.Products, p => p.Id == prod.Id, () => new Product { Id = prod.Id, CompanyId = companyId },
                    p =>
                    {
                        p.Name = prod.Name; p.Barcode = prod.Barcode; p.CategoryId = prod.CategoryId;
                        p.PurchasePrice = prod.PurchasePrice; p.SalePrice = prod.SalePrice; p.SupplierId = prod.SupplierId;
                        p.IsFavorite = prod.IsFavorite; p.IsActive = prod.IsActive; p.LowStockThreshold = prod.LowStockThreshold;
                        p.TaxRateOverridePercent = prod.TaxRateOverridePercent; p.UpdatedAt = prod.UpdatedAt;
                    }, ct);

                var existingLevels = await db.ProductPackagingLevels.Where(l => l.ProductId == product.Id).ToListAsync(ct);
                foreach (var level in prod.PackagingLevels)
                {
                    var existing = existingLevels.FirstOrDefault(l => l.Id == level.Id);
                    if (existing is not null)
                    {
                        existing.UnitName = level.UnitName;
                        existing.QuantityInBaseUnits = level.QuantityInBaseUnits;
                        existing.SalePriceOverride = level.SalePriceOverride;
                    }
                    else
                    {
                        db.ProductPackagingLevels.Add(new ProductPackagingLevel
                        {
                            Id = level.Id, ProductId = product.Id, UnitName = level.UnitName,
                            QuantityInBaseUnits = level.QuantityInBaseUnits, SalePriceOverride = level.SalePriceOverride,
                        });
                    }
                }
                var pulledLevelIds = prod.PackagingLevels.Select(l => l.Id).ToHashSet();
                db.ProductPackagingLevels.RemoveRange(existingLevels.Where(l => !pulledLevelIds.Contains(l.Id)));
                count++;
            }

            foreach (var batch in pull.Batches)
            {
                await UpsertAsync(db.Batches, b => b.Id == batch.Id, () => new Batch { Id = batch.Id, ProductId = batch.ProductId, LocationId = batch.LocationId },
                    b =>
                    {
                        b.BatchNumber = batch.BatchNumber; b.ExpiryDate = batch.ExpiryDate;
                        b.QuantityInBaseUnits = batch.QuantityInBaseUnits; b.PurchasePricePerBaseUnit = batch.PurchasePricePerBaseUnit;
                        b.UpdatedAt = batch.UpdatedAt;
                    }, ct);
                count++;
            }

            foreach (var movement in pull.StockMovements)
            {
                if (await db.StockMovements.AnyAsync(m => m.Id == movement.Id, ct)) continue;
                db.StockMovements.Add(new StockMovement
                {
                    Id = movement.Id, ProductId = movement.ProductId, BatchId = movement.BatchId,
                    LocationId = movement.LocationId, DestinationLocationId = movement.DestinationLocationId,
                    Type = movement.Type, QuantityInBaseUnits = movement.QuantityInBaseUnits,
                    Reason = movement.Reason, UserId = movement.UserId, Timestamp = movement.Timestamp,
                });
                count++;
            }

            await db.SaveChangesAsync(ct);
            return count;
        }, ct);

        _session.SaveLastSyncedAt(pull.ServerTimestamp);
        return rowsPulled;
    }

    private static async Task UpsertCompanyAsync(PharmaStockDbContext db, Guid companyId, SyncPullCompanyInfo info, CancellationToken ct)
    {
        var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company is null)
        {
            db.Companies.Add(new Company
            {
                Id = companyId, Name = info.Name, UniqueCode = info.UniqueCode, Currency = info.Currency, DefaultTaxRatePercent = info.DefaultTaxRatePercent,
                LoyaltyEnabled = info.LoyaltyEnabled, LoyaltyEarnRateAmount = info.LoyaltyEarnRateAmount, LoyaltyPointValue = info.LoyaltyPointValue,
            });
        }
        else
        {
            company.Name = info.Name;
            company.UniqueCode = info.UniqueCode;
            company.Currency = info.Currency;
            company.DefaultTaxRatePercent = info.DefaultTaxRatePercent;
            company.LoyaltyEnabled = info.LoyaltyEnabled;
            company.LoyaltyEarnRateAmount = info.LoyaltyEarnRateAmount;
            company.LoyaltyPointValue = info.LoyaltyPointValue;
        }
    }

    // Generic upsert-by-Id: local rows are always fully overwritten by the
    // server's copy (server is authoritative for every read-cached entity
    // type in V1's scope — none of these are ever edited on-device).
    private static async Task<TEntity> UpsertAsync<TEntity>(
        DbSet<TEntity> set, System.Linq.Expressions.Expression<Func<TEntity, bool>> predicate,
        Func<TEntity> create, Action<TEntity> apply, CancellationToken ct) where TEntity : class
    {
        var existing = await set.FirstOrDefaultAsync(predicate, ct);
        if (existing is not null)
        {
            apply(existing);
            return existing;
        }

        var entity = create();
        apply(entity);
        set.Add(entity);
        return entity;
    }
}
