using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

public record SupportAttachmentUpload(string FileName, string ContentType, string DataBase64);

/// <summary>Id is client-generated when filed offline (outbox) — a replay of an
/// already-received ticket is acknowledged instead of duplicated.</summary>
public record CreateSupportTicketRequest(
    SupportTicketCategory Category, string Description, DevicePlatform Platform,
    string? Title = null, string? AppVersion = null, string? DeviceInfo = null, string? Screen = null,
    List<SupportAttachmentUpload>? Attachments = null, Guid? Id = null);

public record SupportTicketSummary(
    Guid Id, SupportTicketCategory Category, SupportTicketStatus Status, string Title,
    DateTime CreatedAt, DateTime UpdatedAt, string? AdminReply, DateTime? RepliedAt, int AttachmentCount,
    // Console-only context (null in "my tickets").
    string? CompanyName, string? UserName, DevicePlatform Platform);

public record SupportAttachmentInfo(Guid Id, string FileName, string ContentType, int SizeBytes);

public record SupportTicketDetail(
    Guid Id, SupportTicketCategory Category, SupportTicketStatus Status, string Title, string Description,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? ResolvedAt, string? AdminReply, DateTime? RepliedAt,
    Guid? CompanyId, string? CompanyName, Guid UserId, string UserName, string? UserPhone,
    DevicePlatform Platform, string? AppVersion, string? DeviceInfo, string? Screen,
    List<SupportAttachmentInfo> Attachments);

public record SetSupportStatusRequest(SupportTicketStatus Status);
public record ReplySupportTicketRequest(string Reply, SupportTicketStatus? Status = null);

/// <summary>In-app support: any signed-in user (mobile, desktop, web) reports a
/// bug, a blocking problem or a question, with screenshots; the SuperAdmin
/// triages and answers from the web console.</summary>
public static class SupportEndpoints
{
    private const int MaxAttachments = 5;
    private const int MaxAttachmentBytes = 5 * 1024 * 1024;
    private const int MaxTotalAttachmentBytes = 15 * 1024 * 1024;
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif" };

    public static void MapSupportEndpoints(this WebApplication app)
    {
        // ── Reporter side ───────────────────────────────────────────────────
        var mine = app.MapGroup("/api/support/tickets").RequireAuthorization();

        mine.MapPost("/", async (CreateSupportTicketRequest request, PharmaStockDbContext db, HttpContext http,
            EmailService email, IConfiguration config, ILoggerFactory loggerFactory) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            if (request.Id is Guid replayId)
            {
                var existing = await db.SupportTickets.FirstOrDefaultAsync(t => t.Id == replayId && t.UserId == userId);
                if (existing is not null) return Results.Ok(new { existing.Id });
            }

            var description = request.Description?.Trim() ?? "";
            if (description.Length == 0)
                return Results.BadRequest(new { message = "Décrivez le problème. / Please describe the problem." });
            if (description.Length > 8000) description = description[..8000];

            var uploads = request.Attachments ?? new List<SupportAttachmentUpload>();
            if (uploads.Count > MaxAttachments)
                return Results.BadRequest(new { message = $"{MaxAttachments} images maximum." });

            var attachments = new List<SupportAttachment>();
            var total = 0;
            foreach (var up in uploads)
            {
                if (!AllowedImageTypes.Contains(up.ContentType ?? ""))
                    return Results.BadRequest(new { message = "Seules les images sont acceptées. / Only images are accepted." });
                byte[] bytes;
                try { bytes = Convert.FromBase64String(up.DataBase64 ?? ""); }
                catch (FormatException) { return Results.BadRequest(new { message = "Image illisible. / Unreadable image." }); }
                if (bytes.Length == 0 || bytes.Length > MaxAttachmentBytes)
                    return Results.BadRequest(new { message = "Chaque image doit faire moins de 5 Mo. / Each image must be under 5 MB." });
                total += bytes.Length;
                if (total > MaxTotalAttachmentBytes)
                    return Results.BadRequest(new { message = "Images trop lourdes au total (15 Mo max). / Images too large in total (15 MB max)." });
                attachments.Add(new SupportAttachment
                {
                    FileName = string.IsNullOrWhiteSpace(up.FileName) ? "image" : Path.GetFileName(up.FileName.Trim())[..Math.Min(255, Path.GetFileName(up.FileName.Trim()).Length)],
                    ContentType = up.ContentType!.ToLowerInvariant(),
                    SizeBytes = bytes.Length,
                    Data = bytes,
                });
            }

            var user = await db.Users.Include(u => u.Company).FirstOrDefaultAsync(u => u.Id == userId);
            var companyId = http.User.GetCompanyId();
            var companyName = companyId is Guid cid
                ? await db.Companies.Where(c => c.Id == cid).Select(c => c.Name).FirstOrDefaultAsync()
                : null;

            var title = string.IsNullOrWhiteSpace(request.Title)
                ? description.Split('\n', 2)[0].Trim()
                : request.Title.Trim();
            if (title.Length > 200) title = title[..197] + "…";

            var ticket = new SupportTicket
            {
                Id = request.Id ?? Guid.NewGuid(),
                CompanyId = companyId,
                CompanyName = companyName,
                UserId = userId.Value,
                UserName = user?.Name ?? http.User.Identity?.Name ?? "—",
                UserPhone = user?.Phone,
                Category = request.Category,
                Title = title,
                Description = description,
                Platform = request.Platform,
                AppVersion = Trim(request.AppVersion, 50),
                DeviceInfo = Trim(request.DeviceInfo, 300),
                Screen = Trim(request.Screen, 300),
                Attachments = attachments,
            };
            db.SupportTickets.Add(ticket);
            await db.SaveChangesAsync();
            // Tell the support inbox (background — never delays or fails the request).
            SupportNotifier.NotifyNewTicket(ticket, email, config, loggerFactory.CreateLogger("Support"));
            return Results.Created($"/api/support/tickets/{ticket.Id}", new { ticket.Id });
        });

        mine.MapGet("/mine", async (PharmaStockDbContext db, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var rows = await db.SupportTickets
                .Where(t => t.UserId == userId)
                .OrderByDescending(t => t.CreatedAt)
                .Take(100)
                .Select(t => new SupportTicketSummary(t.Id, t.Category, t.Status, t.Title, t.CreatedAt, t.UpdatedAt,
                    t.AdminReply, t.RepliedAt, t.Attachments.Count, null, null, t.Platform))
                .ToListAsync();
            return Results.Ok(rows);
        });

        // ── SuperAdmin console ──────────────────────────────────────────────
        var admin = app.MapGroup("/api/superadmin/support").RequireAuthorization("SuperAdminOnly");

        admin.MapGet("/", async (SupportTicketStatus? status, PharmaStockDbContext db) =>
        {
            var q = db.SupportTickets.AsQueryable();
            if (status is not null) q = q.Where(t => t.Status == status);
            var rows = await q
                .OrderByDescending(t => t.CreatedAt)
                .Take(500)
                .Select(t => new SupportTicketSummary(t.Id, t.Category, t.Status, t.Title, t.CreatedAt, t.UpdatedAt,
                    t.AdminReply, t.RepliedAt, t.Attachments.Count, t.CompanyName, t.UserName, t.Platform))
                .ToListAsync();
            return Results.Ok(rows);
        });

        admin.MapGet("/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var t = await db.SupportTickets.Include(x => x.Attachments).FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            return Results.Ok(new SupportTicketDetail(t.Id, t.Category, t.Status, t.Title, t.Description,
                t.CreatedAt, t.UpdatedAt, t.ResolvedAt, t.AdminReply, t.RepliedAt,
                t.CompanyId, t.CompanyName, t.UserId, t.UserName, t.UserPhone,
                t.Platform, t.AppVersion, t.DeviceInfo, t.Screen,
                t.Attachments.OrderBy(a => a.CreatedAt).Select(a => new SupportAttachmentInfo(a.Id, a.FileName, a.ContentType, a.SizeBytes)).ToList()));
        });

        admin.MapGet("/{id:guid}/attachments/{attachmentId:guid}", async (Guid id, Guid attachmentId, PharmaStockDbContext db) =>
        {
            var a = await db.SupportAttachments.FirstOrDefaultAsync(x => x.Id == attachmentId && x.TicketId == id);
            return a is null ? Results.NotFound() : Results.File(a.Data, a.ContentType, a.FileName);
        });

        admin.MapPost("/{id:guid}/status", async (Guid id, SetSupportStatusRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            ApplyStatus(t, request.Status);
            Audit(db, http, $"support.status.{request.Status.ToString().ToLowerInvariant()}", t);
            await db.SaveChangesAsync();
            return Results.Ok(new { t.Id, t.Status });
        });

        admin.MapPost("/{id:guid}/reply", async (Guid id, ReplySupportTicketRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            var reply = request.Reply?.Trim() ?? "";
            if (reply.Length == 0) return Results.BadRequest(new { message = "Réponse vide." });
            t.AdminReply = reply.Length > 8000 ? reply[..8000] : reply;
            t.RepliedAt = DateTime.UtcNow;
            ApplyStatus(t, request.Status ?? (t.Status == SupportTicketStatus.Open ? SupportTicketStatus.InProgress : t.Status));
            Audit(db, http, "support.reply", t);
            await db.SaveChangesAsync();
            return Results.Ok(new { t.Id, t.Status });
        });
    }

    private static void ApplyStatus(SupportTicket t, SupportTicketStatus status)
    {
        t.Status = status;
        t.UpdatedAt = DateTime.UtcNow;
        t.ResolvedAt = status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed ? (t.ResolvedAt ?? DateTime.UtcNow) : null;
    }

    private static void Audit(PharmaStockDbContext db, HttpContext http, string action, SupportTicket t) =>
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = http.User.GetUserId(), ActorName = http.User.Identity?.Name ?? "SuperAdmin",
            Action = action, TargetType = "support", TargetId = t.Id, CompanyId = t.CompanyId,
            Ip = http.GetClientIp(), Detail = t.Title,
        });

    private static string? Trim(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());
}
