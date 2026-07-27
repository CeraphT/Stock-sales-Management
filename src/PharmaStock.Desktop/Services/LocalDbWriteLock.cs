namespace PharmaStock.Desktop.Services;

/// <summary>Serializes writes to the local SQLite database within this
/// process — the client-side analog of what Postgres's `FOR UPDATE` does
/// server-side in StockDeductionService. Each device's SQLite file has no
/// other writer to lock against except this same app, so a single semaphore
/// around each local transaction (checkout, shift open/close, sync-pull
/// apply) is enough to prevent two concurrent local operations from racing
/// on the same batch's stock.</summary>
public class LocalDbWriteLock
{
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    public async Task<T> RunAsync<T>(Func<Task<T>> action, CancellationToken ct = default)
    {
        await _semaphore.WaitAsync(ct);
        try
        {
            return await action();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task RunAsync(Func<Task> action, CancellationToken ct = default)
    {
        await _semaphore.WaitAsync(ct);
        try
        {
            await action();
        }
        finally
        {
            _semaphore.Release();
        }
    }
}
