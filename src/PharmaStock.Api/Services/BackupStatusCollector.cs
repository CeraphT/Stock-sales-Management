using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record BackupFile(string Name, long SizeBytes, DateTime CreatedAt, string? Label = null);

public record BackupFeatureKpi(string Label, long Count, long? Delta);

/// <summary>One backup source as shown in the daily report and the console:
/// <c>History</c> has 28 entries (oldest first, today last), null = unknown.</summary>
public record BackupSourceStatus(
    string Key, string Name, string Location, string Application, string Type,
    List<string> DataSources, long? DataSizeBytes, long? StorageBytes,
    DateTime? LastSuccessAt, BackupState State, string? Note,
    List<BackupState?> History, int ErrorCount, bool Downloadable,
    List<BackupFile> Files, List<BackupFeatureKpi> Kpis);

public record BackupReport(DateTime GeneratedAt, string ConsoleUrl, List<BackupSourceStatus> Sources);

/// <summary>Builds the server-wide backup status (both apps) from what the
/// backup jobs leave on disk, read-only:
/// <list type="bullet">
/// <item>SERVER_BACKUP_DIR (prod: /root/backups mounted read-only): the nightly
/// <c>pg_dump</c> files <c>{db}-yyyyMMdd-HHmmss.dump</c> written by
/// /root/bin/pg-backup.sh (03:30 UTC), plus its <c>LAST_OK</c> marker and the
/// PC's <c>LAST_PULLED</c> heartbeat (off-server copy).</item>
/// <item>HB_BACKUP_DIR (prod: the hb_backups volume, read-only): HouseBudget's
/// per-property JSON exports <c>{houseId}/yyyyMMdd-HHmmss.json</c> (02:00 UTC).</item>
/// </list>
/// Row counts per feature come straight from both databases (same Postgres).
/// The 28-day history comes from <see cref="BackupSnapshot"/> rows, filled in
/// from the dump files still on disk for days without one.</summary>
public class BackupStatusCollector(IConfiguration config, PharmaStockDbContext db, ILogger<BackupStatusCollector> logger)
{
    public const int HistoryDays = 28;
    /// <summary>A nightly backup older than this is late (a day plus slack).</summary>
    private static readonly TimeSpan FreshFor = TimeSpan.FromHours(26);
    /// <summary>The PC pulls once a day when it is on; past this it's a failure.</summary>
    private static readonly TimeSpan OffsiteFailAfter = TimeSpan.FromHours(72);

    private static readonly (string Label, string Table)[] StockFlowFeatures =
    [
        ("Entreprises", "Companies"), ("Utilisateurs", "Users"), ("Appareils", "Devices"),
        ("Points de vente", "Locations"), ("Produits", "Products"), ("Catégories", "Categories"),
        ("Lots de stock", "Batches"), ("Mouvements de stock", "StockMovements"),
        ("Ventes", "Sales"), ("Lignes de vente", "SaleLines"), ("Clients", "Customers"),
        ("Fournisseurs", "Suppliers"), ("Commandes fournisseurs", "PurchaseOrders"),
        ("Cartes cadeaux", "GiftCards"), ("Services", "Services"),
        ("Sessions de caisse", "CashRegisterShifts"), ("Paiements échelonnés", "InstallmentPlans"),
        ("Demandes de support", "SupportTickets"),
    ];

    private static readonly (string Label, string Table)[] HouseBudgetFeatures =
    [
        ("Utilisateurs", "Users"), ("Biens", "Houses"), ("Unités", "Rooms"),
        ("Contrats", "Contracts"), ("Loyers encaissés", "ContractPayments"),
        ("Transactions", "Transactions"), ("Catégories", "Categories"),
        ("Documents", "StoredDocuments"), ("Modèles de documents", "DocumentTemplates"),
        ("Plans d'épargne", "SavingsPlans"), ("Objectifs d'épargne", "SavingsGoals"),
    ];

    private static readonly Regex DumpName = new(@"^(?<db>[a-z_]+)-(?<ts>\d{8}-\d{6})\.dump$", RegexOptions.Compiled);
    private static readonly Regex ExportName = new(@"^(?<house>[0-9a-fA-F-]{36})/(?<ts>\d{8}-\d{6})\.json$", RegexOptions.Compiled);

    private string? Get(string key) => config[key] ?? Environment.GetEnvironmentVariable(key);

    public string ServerBackupDir => Get("SERVER_BACKUP_DIR") ?? "/backups/server";
    public string HbBackupDir => Get("HB_BACKUP_DIR") ?? "/backups/hb-exports";
    public string ConsoleUrl => Get("BACKUP_CONSOLE_URL") ?? "https://stock.mfspace.lu/superadmin/backups";

    /// <summary>HouseBudget's database: HB_DB_CONNECTION, else this API's own
    /// connection string pointed at the "housebudget" database (same server).</summary>
    private string? HbConnectionString()
    {
        if (Get("HB_DB_CONNECTION") is { Length: > 0 } explicitCs) return explicitCs;
        var own = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(own)) return null;
        return new NpgsqlConnectionStringBuilder(own) { Database = "housebudget" }.ConnectionString;
    }

    public async Task<BackupReport> CollectAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var today = now.Date;
        var since = today.AddDays(-(HistoryDays - 1));
        var snapshots = await db.BackupSnapshots.AsNoTracking()
            .Where(s => s.Day >= since.AddDays(-1))
            .ToListAsync(ct);

        var lastOk = ReadMarker("LAST_OK");
        var dumps = ListDumps();

        var sources = new List<BackupSourceStatus>
        {
            await DatabaseSourceAsync("pharmastock", "StockFlow", db.Database.GetConnectionString(),
                StockFlowFeatures, dumps, lastOk, snapshots, now, ct),
            await DatabaseSourceAsync("housebudget", "HouseBudget", HbConnectionString(),
                HouseBudgetFeatures, dumps, lastOk, snapshots, now, ct),
            await HouseExportsSourceAsync(snapshots, now, ct),
            OffsiteSource(snapshots, now),
        };
        return new BackupReport(now, ConsoleUrl, sources);
    }

    /// <summary>Records today's state of every source (upsert), so the history
    /// keeps more than the 14 days of dumps the server retains.</summary>
    public async Task RecordSnapshotsAsync(BackupReport report, CancellationToken ct = default)
    {
        var day = report.GeneratedAt.Date;
        var existing = await db.BackupSnapshots.Where(s => s.Day == day).ToListAsync(ct);
        foreach (var s in report.Sources)
        {
            var row = existing.FirstOrDefault(e => e.SourceKey == s.Key);
            if (row is null)
            {
                row = new BackupSnapshot { Day = day, SourceKey = s.Key };
                db.BackupSnapshots.Add(row);
            }
            row.State = s.State;
            row.SizeBytes = s.Files.Where(f => f.CreatedAt.Date == day).Sum(f => f.SizeBytes);
            row.KpiJson = s.Kpis.Count == 0 ? null
                : JsonSerializer.Serialize(s.Kpis.ToDictionary(k => k.Label, k => k.Count));
            row.CreatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>True once today's snapshot exists, i.e. today's report went out.</summary>
    public Task<bool> RecordedTodayAsync(CancellationToken ct = default)
    {
        var day = DateTime.UtcNow.Date;
        return db.BackupSnapshots.AnyAsync(s => s.Day == day, ct);
    }

    /// <summary>Resolves a downloadable file (exact name from the listing, so no
    /// path tricks) to its absolute path, or null.</summary>
    public string? ResolveDownload(string source, string name)
    {
        if (source.StartsWith("pg:"))
        {
            var m = DumpName.Match(name);
            if (!m.Success || $"pg:{m.Groups["db"].Value}" != source) return null;
            var path = Path.Combine(ServerBackupDir, name);
            return File.Exists(path) ? path : null;
        }
        if (source == "hb-exports")
        {
            var m = ExportName.Match(name);
            if (!m.Success) return null;
            var path = Path.Combine(HbBackupDir, m.Groups["house"].Value, $"{m.Groups["ts"].Value}.json");
            return File.Exists(path) ? path : null;
        }
        return null;
    }

    // ── Sources ────────────────────────────────────────────────────────────

    private async Task<BackupSourceStatus> DatabaseSourceAsync(
        string dbName, string application, string? connectionString,
        (string Label, string Table)[] features, List<(string Db, BackupFile File)> dumps,
        DateTime? lastOk, List<BackupSnapshot> snapshots, DateTime now, CancellationToken ct)
    {
        var key = $"pg:{dbName}";
        var files = dumps.Where(d => d.Db == dbName).Select(d => d.File)
            .OrderByDescending(f => f.CreatedAt).ToList();
        var latest = files.FirstOrDefault();

        long? dbSize = null;
        var kpis = new List<BackupFeatureKpi>();
        string? note = null;
        if (connectionString is not null)
        {
            try
            {
                (dbSize, var counts) = await CountRowsAsync(connectionString, features, ct);
                var yesterday = KpisOf(snapshots, key, now.Date.AddDays(-1));
                kpis = counts.Select(c => new BackupFeatureKpi(c.Label, c.Count,
                    yesterday is not null && yesterday.TryGetValue(c.Label, out var prev) ? c.Count - prev : null)).ToList();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Backup report: cannot read database {Db}", dbName);
                note = "Base de données injoignable pour les indicateurs.";
            }
        }

        BackupState state;
        if (latest is null)
            state = BackupState.NoBackup;
        else if (HasTempFile(ServerBackupDir, dbName))
            state = BackupState.InProcess;
        else if (now - latest.CreatedAt > FreshFor)
        {
            state = BackupState.Unsuccessful;
            note = $"Aucune sauvegarde depuis {Age(now - latest.CreatedAt)}.";
        }
        else if (lastOk is not null && latest.CreatedAt > lastOk.Value.AddMinutes(30))
        {
            // pg-backup.sh writes LAST_OK only after validating every dump.
            state = BackupState.CompletedWithErrors;
            note = "Dernière sauvegarde non validée (LAST_OK plus ancien).";
        }
        else
            state = BackupState.Completed;

        var history = History(key, snapshots, now, state, day => files.Any(f => f.CreatedAt.Date == day));
        return new BackupSourceStatus(
            key, dbName, Get("SERVER_BACKUP_LABEL") ?? "Serveur · /root/backups", application, "Base PostgreSQL (pg_dump)",
            features.Select(f => f.Label).ToList(), dbSize,
            files.Count == 0 ? null : files.Sum(f => f.SizeBytes),
            latest?.CreatedAt, state, note, history, ErrorCount(history), true, files, kpis);
    }

    private async Task<BackupSourceStatus> HouseExportsSourceAsync(List<BackupSnapshot> snapshots, DateTime now, CancellationToken ct)
    {
        const string key = "hb-exports";
        var houses = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (HbConnectionString() is { } cs)
        {
            try
            {
                await using var conn = new NpgsqlConnection(cs);
                await conn.OpenAsync(ct);
                await using var cmd = new NpgsqlCommand("select \"Id\"::text, \"Name\" from \"Houses\" order by \"Name\"", conn);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct)) houses[r.GetString(0)] = r.GetString(1);
            }
            catch (Exception ex) { logger.LogWarning(ex, "Backup report: cannot list HouseBudget properties"); }
        }

        var files = new List<BackupFile>();
        if (Directory.Exists(HbBackupDir))
        {
            foreach (var dir in new DirectoryInfo(HbBackupDir).GetDirectories())
            {
                // Only properties that still exist (when the DB answered).
                if (houses.Count > 0 && !houses.ContainsKey(dir.Name)) continue;
                houses.TryGetValue(dir.Name, out var houseName);
                foreach (var f in dir.GetFiles("*.json"))
                    files.Add(new BackupFile($"{dir.Name}/{f.Name}", f.Length,
                        ParseStamp(Path.GetFileNameWithoutExtension(f.Name)) ?? f.LastWriteTimeUtc, houseName ?? dir.Name));
            }
        }
        files = files.OrderByDescending(f => f.CreatedAt).ToList();

        var latestPerHouse = files.GroupBy(f => f.Name[..36]).Select(g => g.First()).ToList();
        var houseIds = houses.Count > 0 ? houses.Keys.ToList() : latestPerHouse.Select(f => f.Name[..36]).ToList();
        var missing = houseIds.Where(id => !latestPerHouse.Any(f =>
            f.Name.StartsWith(id, StringComparison.OrdinalIgnoreCase) && now - f.CreatedAt <= FreshFor)).ToList();

        BackupState state;
        string? note = null;
        if (files.Count == 0) state = BackupState.NoBackup;
        else if (missing.Count == houseIds.Count) { state = BackupState.Unsuccessful; note = "Aucun bien sauvegardé cette nuit."; }
        else if (missing.Count > 0)
        {
            state = BackupState.CompletedWithErrors;
            note = $"{missing.Count} bien(s) sans sauvegarde récente : " +
                   string.Join(", ", missing.Select(id => houses.TryGetValue(id, out var n) ? n : id[..8]));
        }
        else state = BackupState.Completed;

        // The oldest "latest export" is the honest last-success time for the set.
        DateTime? lastSuccess = latestPerHouse.Count == 0 ? null
            : missing.Count == 0 ? latestPerHouse.Min(f => f.CreatedAt) : latestPerHouse.Max(f => f.CreatedAt);
        var history = History(key, snapshots, now, state, day => files.Any(f => f.CreatedAt.Date == day));
        var dataSources = houses.Count > 0 ? houses.Values.ToList() : latestPerHouse.Select(f => f.Label ?? f.Name).ToList();
        return new BackupSourceStatus(
            key, "Exports par bien", Get("HB_BACKUP_LABEL") ?? "Serveur · volume hb_backups", "HouseBudget", "Export JSON (par bien)",
            dataSources, latestPerHouse.Count == 0 ? null : latestPerHouse.Sum(f => f.SizeBytes),
            files.Count == 0 ? null : files.Sum(f => f.SizeBytes),
            lastSuccess, state, note, history, ErrorCount(history), true, files, []);
    }

    private BackupSourceStatus OffsiteSource(List<BackupSnapshot> snapshots, DateTime now)
    {
        const string key = "offsite";
        var pulled = ReadMarker("LAST_PULLED");
        BackupState state;
        string? note = null;
        if (pulled is null) state = BackupState.NoBackup;
        else if (now - pulled.Value > OffsiteFailAfter) { state = BackupState.Unsuccessful; note = $"Pas de copie depuis {Age(now - pulled.Value)}."; }
        else if (now - pulled.Value > FreshFor) { state = BackupState.CompletedWithErrors; note = $"Dernière copie il y a {Age(now - pulled.Value)} (PC éteint ?)."; }
        else state = BackupState.Completed;

        var history = History(key, snapshots, now, state, _ => false);
        return new BackupSourceStatus(
            key, "Copie hors serveur", Get("OFFSITE_LABEL") ?? "PC · C:\\Dev\\prod-backups", "StockFlow + HouseBudget",
            "Copie distante (scp)", ["pharmastock", "housebudget"], null, null,
            pulled, state, note, history, ErrorCount(history), false, [], []);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private List<(string Db, BackupFile File)> ListDumps()
    {
        var list = new List<(string, BackupFile)>();
        if (!Directory.Exists(ServerBackupDir)) return list;
        foreach (var f in new DirectoryInfo(ServerBackupDir).GetFiles("*.dump"))
        {
            var m = DumpName.Match(f.Name);
            if (!m.Success) continue;
            list.Add((m.Groups["db"].Value,
                new BackupFile(f.Name, f.Length, ParseStamp(m.Groups["ts"].Value) ?? f.LastWriteTimeUtc)));
        }
        return list;
    }

    private static bool HasTempFile(string dir, string dbName) =>
        Directory.Exists(dir) && new DirectoryInfo(dir).GetFiles($"{dbName}-*")
            .Any(f => (f.Name.EndsWith(".partial") || f.Name.EndsWith(".tmp"))
                      && DateTime.UtcNow - f.LastWriteTimeUtc < TimeSpan.FromHours(2));

    /// <summary>Reads an ISO-8601 UTC timestamp marker file (LAST_OK, LAST_PULLED).</summary>
    private DateTime? ReadMarker(string name)
    {
        var path = Path.Combine(ServerBackupDir, name);
        if (!File.Exists(path)) return null;
        try
        {
            var text = File.ReadAllText(path).Trim();
            return DateTime.TryParse(text, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var t)
                ? t : File.GetLastWriteTimeUtc(path);
        }
        catch { return null; }
    }

    private static DateTime? ParseStamp(string s) =>
        DateTime.TryParseExact(s, "yyyyMMdd-HHmmss", CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var t) ? t : null;

    /// <summary>Database size plus a row count per feature table (tables that
    /// don't exist in this schema version are skipped).</summary>
    private static async Task<(long Size, List<(string Label, long Count)>)> CountRowsAsync(
        string connectionString, (string Label, string Table)[] features, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var existing = new HashSet<string>();
        await using (var cmd = new NpgsqlCommand(
            "select table_name from information_schema.tables where table_schema = 'public'", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetString(0));

        long size;
        await using (var cmd = new NpgsqlCommand("select pg_database_size(current_database())", conn))
            size = (long)(await cmd.ExecuteScalarAsync(ct))!;

        var present = features.Where(f => existing.Contains(f.Table)).ToList();
        var counts = new List<(string, long)>();
        if (present.Count == 0) return (size, counts);
        // Table names come from the fixed lists above, never from input.
        var sql = string.Join(" union all ", present.Select((f, i) => $"select {i}, count(*) from \"{f.Table}\""));
        await using (var cmd = new NpgsqlCommand(sql, conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            var byIndex = new Dictionary<int, long>();
            while (await r.ReadAsync(ct)) byIndex[r.GetInt32(0)] = r.GetInt64(1);
            for (var i = 0; i < present.Count; i++) counts.Add((present[i].Label, byIndex.GetValueOrDefault(i)));
        }
        return (size, counts);
    }

    private static Dictionary<string, long>? KpisOf(List<BackupSnapshot> snapshots, string key, DateTime day)
    {
        var json = snapshots.FirstOrDefault(s => s.SourceKey == key && s.Day == day)?.KpiJson;
        if (json is null) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, long>>(json); } catch { return null; }
    }

    /// <summary>28 days, oldest first: the recorded snapshot, else "Completed" when
    /// a backup file of that day is still on disk, else unknown; today = live state.</summary>
    private static List<BackupState?> History(string key, List<BackupSnapshot> snapshots, DateTime now,
        BackupState current, Func<DateTime, bool> hasFileOn)
    {
        var list = new List<BackupState?>(HistoryDays);
        for (var i = HistoryDays - 1; i >= 0; i--)
        {
            var day = now.Date.AddDays(-i);
            if (i == 0) { list.Add(current); continue; }
            var snap = snapshots.FirstOrDefault(s => s.SourceKey == key && s.Day == day);
            list.Add(snap?.State ?? (hasFileOn(day) ? BackupState.Completed : null));
        }
        return list;
    }

    private static int ErrorCount(List<BackupState?> history) =>
        history.Count(h => h is BackupState.Unsuccessful or BackupState.CompletedWithErrors);

    public static string Age(TimeSpan t) =>
        t.TotalHours < 48 ? $"{(int)t.TotalHours} h" : $"{(int)t.TotalDays} jours";
}
