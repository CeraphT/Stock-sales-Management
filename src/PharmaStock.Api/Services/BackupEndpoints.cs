using Microsoft.AspNetCore.StaticFiles;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>Super-admin Backups page: the same status the daily e-mail shows,
/// file downloads (the e-mail's "Télécharger" link lands here, behind login),
/// an e-mail preview and a "send now". Every download is audited.</summary>
public static class BackupEndpoints
{
    public static void MapBackupEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/superadmin/backups").RequireAuthorization("SuperAdminOnly");

        group.MapGet("", async (BackupStatusCollector collector, CancellationToken ct) =>
            Results.Ok(await collector.CollectAsync(ct)));

        group.MapGet("/download", async (string source, string name, BackupStatusCollector collector,
            PharmaStockDbContext db, HttpContext http) =>
        {
            var path = collector.ResolveDownload(source, name);
            if (path is null) return Results.NotFound(new { message = "Fichier de sauvegarde introuvable." });

            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = http.User.GetUserId(),
                ActorName = http.User.Identity?.Name ?? "SuperAdmin",
                Action = "backup.download",
                TargetType = "backup",
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                Detail = $"{source} · {name}",
            });
            await db.SaveChangesAsync();

            var fileName = source == "hb-exports" ? $"housebudget-{name.Replace('/', '-')}" : name;
            if (!new FileExtensionContentTypeProvider().TryGetContentType(fileName, out var type))
                type = "application/octet-stream";
            return Results.File(path, type, fileName, enableRangeProcessing: true);
        });

        // The exact e-mail HTML, for the page's preview.
        group.MapGet("/report/preview", async (BackupStatusCollector collector, CancellationToken ct) =>
        {
            var (subject, html) = BackupReportEmail.Build(await collector.CollectAsync(ct));
            return Results.Ok(new { subject, html });
        });

        group.MapPost("/report/send", async (BackupStatusCollector collector, BackupReportService service,
            EmailService email, CancellationToken ct) =>
        {
            if (!email.IsConfigured)
                return Results.BadRequest(new { message = "L'envoi d'e-mails n'est pas configuré (SMTP)." });
            var to = await service.SendAsync(collector, ct);
            return Results.Ok(new { to });
        });
    }
}
