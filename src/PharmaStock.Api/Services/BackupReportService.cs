namespace PharmaStock.Api.Services;

/// <summary>Sends the daily backup report e-mail (BACKUP_REPORT_TO, else
/// SUPPORT_NOTIFY_EMAIL, else the SMTP sender) at BACKUP_REPORT_HOUR_UTC
/// (default 05:00 UTC: after HouseBudget's exports at 02:00, the pg_dumps at
/// 03:30 and the watchdog at 04:15). Today's snapshot rows double as the
/// "already sent" marker, so a restart after the hour catches up once instead
/// of skipping the day or sending twice. Off when BACKUP_REPORT_DISABLED=true
/// or SMTP isn't configured (dev).</summary>
public class BackupReportService(IServiceScopeFactory scopeFactory, EmailService email, IConfiguration config,
    ILogger<BackupReportService> logger) : BackgroundService
{
    private string? Get(string key) => config[key] ?? Environment.GetEnvironmentVariable(key);

    private int Hour => int.TryParse(Get("BACKUP_REPORT_HOUR_UTC"), out var h) && h is >= 0 and < 24 ? h : 5;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (Get("BACKUP_REPORT_DISABLED") == "true" || !email.IsConfigured) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTime.UtcNow;
                if (now.Hour >= Hour)
                {
                    using var scope = scopeFactory.CreateScope();
                    var collector = scope.ServiceProvider.GetRequiredService<BackupStatusCollector>();
                    if (!await collector.RecordedTodayAsync(stoppingToken))
                        await SendAsync(collector, stoppingToken);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Daily backup report failed"); }

            try { await Task.Delay(DelayUntilNextRun(), stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private TimeSpan DelayUntilNextRun()
    {
        var now = DateTime.UtcNow;
        var next = now.Date.AddHours(Hour);
        if (next <= now) next = next.AddDays(1);
        return next - now;
    }

    public string Recipient => Get("BACKUP_REPORT_TO") ?? Get("SUPPORT_NOTIFY_EMAIL") ?? email.FromAddress ?? "infos@mfspace.lu";

    /// <summary>Collects, records today's snapshot, then e-mails. Recording first
    /// means a failed send isn't retried in a loop; the error is logged.</summary>
    public async Task<string> SendAsync(BackupStatusCollector collector, CancellationToken ct = default)
    {
        var report = await collector.CollectAsync(ct);
        await collector.RecordSnapshotsAsync(report, ct);
        var (subject, html) = BackupReportEmail.Build(report);
        await email.SendAsync(Recipient, subject, html);
        logger.LogInformation("Backup report sent to {To}: {Subject}", Recipient, subject);
        return Recipient;
    }
}
