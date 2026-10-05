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

/// <summary>List row. JSON binds by name, so fields are only ever appended
/// (older app versions keep working).</summary>
public record SupportTicketSummary(
    Guid Id, SupportTicketCategory Category, SupportTicketStatus Status, string Title,
    DateTime CreatedAt, DateTime UpdatedAt, string? AdminReply, DateTime? RepliedAt, int AttachmentCount,
    // Console-only context (null in "my tickets").
    string? CompanyName, string? UserName, DevicePlatform Platform,
    // Process fields.
    SupportTicketPriority Priority, string? AssignedToName, bool AwaitingSupport, bool UnreadByReporter,
    DateTime? SlaDueAt, bool SlaBreached, int MessageCount, Guid? AssignedToUserId = null);

public record SupportAttachmentInfo(Guid Id, string FileName, string ContentType, int SizeBytes);
public record SupportMessageInfo(Guid Id, string AuthorName, bool FromSupport, bool IsInternal, string Body, DateTime CreatedAt);

public record SupportTicketDetail(
    Guid Id, SupportTicketCategory Category, SupportTicketStatus Status, string Title, string Description,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? ResolvedAt, string? AdminReply, DateTime? RepliedAt,
    Guid? CompanyId, string? CompanyName, Guid UserId, string UserName, string? UserPhone,
    DevicePlatform Platform, string? AppVersion, string? DeviceInfo, string? Screen,
    List<SupportAttachmentInfo> Attachments,
    SupportTicketPriority Priority, Guid? AssignedToUserId, string? AssignedToName, bool AwaitingSupport,
    DateTime? SlaDueAt, bool SlaBreached, List<SupportMessageInfo> Messages);

/// <summary>What the reporter sees of their own request (no internal notes, no triage).</summary>
public record MySupportTicketDetail(
    Guid Id, SupportTicketCategory Category, SupportTicketStatus Status, string Title, string Description,
    DateTime CreatedAt, int AttachmentCount, List<SupportMessageInfo> Messages);

public record SupportQueueSummary(int Open, int AwaitingSupport, int SlaBreached, int Unassigned, int Mine);

public record SetSupportStatusRequest(SupportTicketStatus Status);
public record ReplySupportTicketRequest(string Reply, SupportTicketStatus? Status = null);
public record SupportNoteRequest(string Body);
public record SupportMessageRequest(string Body);
public record AssignSupportTicketRequest(bool ToMe);
public record SetSupportPriorityRequest(SupportTicketPriority Priority);

/// <summary>In-app support: any signed-in user (mobile, desktop, web) reports a
/// bug, a blocking problem or a question, with screenshots; the SuperAdmin
/// triages and answers from the web console. The handling process (see
/// docs/support-process.md): priority (defaulted from the category) → assign →
/// conversation with the reporter (+ internal notes) within the priority's
/// response-time target → resolve; a resolved request with no reaction closes
/// itself after <see cref="AutoCloseAfter"/>, and the reporter can reopen it by
/// replying.</summary>
public static class SupportEndpoints
{
    private const int MaxAttachments = 5;
    private const int MaxAttachmentBytes = 5 * 1024 * 1024;
    private const int MaxTotalAttachmentBytes = 15 * 1024 * 1024;
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif" };

    /// <summary>Resolved requests with no reaction from the reporter are closed after this.</summary>
    public static readonly TimeSpan AutoCloseAfter = TimeSpan.FromDays(7);

    /// <summary>Response-time target (first/next support answer) per priority.</summary>
    public static TimeSpan SlaFor(SupportTicketPriority p) => p switch
    {
        SupportTicketPriority.Urgent => TimeSpan.FromHours(4),
        SupportTicketPriority.High => TimeSpan.FromHours(24),
        SupportTicketPriority.Normal => TimeSpan.FromHours(72),
        _ => TimeSpan.FromDays(7),
    };

    private static DateTime? SlaDue(SupportTicket t) =>
        t.AwaitingSupport && t.Status is SupportTicketStatus.Open or SupportTicketStatus.InProgress
            ? (t.LastReporterMessageAt ?? t.CreatedAt) + SlaFor(t.Priority)
            : null;

    private static SupportTicketSummary ToSummary(SupportTicket t, bool console)
    {
        var due = SlaDue(t);
        return new SupportTicketSummary(t.Id, t.Category, t.Status, t.Title, t.CreatedAt, t.UpdatedAt,
            t.AdminReply, t.RepliedAt, t.Attachments.Count,
            console ? t.CompanyName : null, console ? t.UserName : null, t.Platform,
            t.Priority, console ? t.AssignedToName : null, t.AwaitingSupport, t.UnreadByReporter,
            console ? due : null, console && due is not null && due < DateTime.UtcNow,
            t.Messages.Count(m => console || !m.IsInternal), console ? t.AssignedToUserId : null);
    }

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
                var name = string.IsNullOrWhiteSpace(up.FileName) ? "image" : Path.GetFileName(up.FileName.Trim());
                attachments.Add(new SupportAttachment
                {
                    FileName = name.Length > 255 ? name[..255] : name,
                    ContentType = up.ContentType!.ToLowerInvariant(),
                    SizeBytes = bytes.Length,
                    Data = bytes,
                });
            }

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
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
                UserName = user?.Name ?? http.User.Identity?.Name ?? "-",
                UserPhone = user?.Phone,
                Category = request.Category,
                // Triage default: someone who can't work at all jumps the queue.
                Priority = request.Category == SupportTicketCategory.Blocked ? SupportTicketPriority.High : SupportTicketPriority.Normal,
                AwaitingSupport = true,
                LastReporterMessageAt = DateTime.UtcNow,
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
                .Include(t => t.Attachments.Where(a => false)) // count via projection below
                .Where(t => t.UserId == userId)
                .OrderByDescending(t => t.UpdatedAt)
                .Take(100)
                .Select(t => new { Ticket = t, Attachments = t.Attachments.Count, Messages = t.Messages.Count(m => !m.IsInternal) })
                .ToListAsync();
            return Results.Ok(rows.Select(r => new SupportTicketSummary(r.Ticket.Id, r.Ticket.Category, r.Ticket.Status, r.Ticket.Title,
                r.Ticket.CreatedAt, r.Ticket.UpdatedAt, r.Ticket.AdminReply, r.Ticket.RepliedAt, r.Attachments,
                null, null, r.Ticket.Platform, r.Ticket.Priority, null, r.Ticket.AwaitingSupport, r.Ticket.UnreadByReporter,
                null, false, r.Messages)));
        });

        // Badge for the apps: requests with a support reply the user hasn't opened.
        mine.MapGet("/mine/unread-count", async (PharmaStockDbContext db, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            return Results.Ok(new { count = await db.SupportTickets.CountAsync(t => t.UserId == userId && t.UnreadByReporter) });
        });

        // Reporter's view of one request (public messages only) — opening it marks the reply as read.
        mine.MapGet("/mine/{id:guid}", async (Guid id, PharmaStockDbContext db, HttpContext http) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var t = await db.SupportTickets.Include(x => x.Messages).Include(x => x.Attachments)
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            if (t.UnreadByReporter)
            {
                t.UnreadByReporter = false;
                await db.SaveChangesAsync();
            }
            return Results.Ok(new MySupportTicketDetail(t.Id, t.Category, t.Status, t.Title, t.Description, t.CreatedAt,
                t.Attachments.Count,
                t.Messages.Where(m => !m.IsInternal).OrderBy(m => m.CreatedAt)
                    .Select(m => new SupportMessageInfo(m.Id, m.FromSupport ? "Support" : m.AuthorName, m.FromSupport, false, m.Body, m.CreatedAt)).ToList()));
        });

        // Reporter follow-up. Replying to a resolved/closed request reopens it.
        mine.MapPost("/mine/{id:guid}/messages", async (Guid id, SupportMessageRequest request, PharmaStockDbContext db, HttpContext http,
            EmailService email, IConfiguration config, ILoggerFactory loggerFactory) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var body = request.Body?.Trim() ?? "";
            if (body.Length == 0) return Results.BadRequest(new { message = "Message vide. / Empty message." });
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            db.SupportMessages.Add(new SupportMessage
            {
                TicketId = t.Id, AuthorUserId = userId.Value, AuthorName = user?.Name ?? t.UserName,
                FromSupport = false, Body = body.Length > 8000 ? body[..8000] : body,
            });
            var reopened = t.Status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed;
            if (reopened) { t.Status = SupportTicketStatus.Open; t.ResolvedAt = null; }
            t.AwaitingSupport = true;
            t.LastReporterMessageAt = DateTime.UtcNow;
            t.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            SupportNotifier.NotifyFollowUp(t, body, reopened, email, config, loggerFactory.CreateLogger("Support"));
            return Results.Ok(new { t.Id, t.Status });
        });

        // ── SuperAdmin console ──────────────────────────────────────────────
        var admin = app.MapGroup("/api/superadmin/support").RequireAuthorization("SuperAdminOnly");

        admin.MapGet("/", async (SupportTicketStatus? status, PharmaStockDbContext db) =>
        {
            await AutoCloseStaleAsync(db);
            var q = db.SupportTickets.Include(t => t.Messages).Include(t => t.Attachments.Where(a => false)).AsQueryable();
            if (status is not null) q = q.Where(t => t.Status == status);
            var rows = await q.OrderByDescending(t => t.UpdatedAt).Take(500)
                .Select(t => new { Ticket = t, Attachments = t.Attachments.Count })
                .ToListAsync();
            var list = rows.Select(r =>
            {
                var s = ToSummary(r.Ticket, console: true);
                return s with { AttachmentCount = r.Attachments };
            })
            // Queue order: what needs support first (late, then by priority), then most recent.
            .OrderByDescending(s => s.AwaitingSupport && s.Status is SupportTicketStatus.Open or SupportTicketStatus.InProgress)
            .ThenByDescending(s => s.SlaBreached)
            .ThenByDescending(s => s.Priority)
            .ThenBy(s => s.SlaDueAt ?? DateTime.MaxValue)
            .ThenByDescending(s => s.UpdatedAt)
            .ToList();
            return Results.Ok(list);
        });

        // Counters for the console nav badge and the queue header.
        admin.MapGet("/summary", async (PharmaStockDbContext db, HttpContext http) =>
        {
            await AutoCloseStaleAsync(db);
            var me = http.User.GetUserId();
            var active = await db.SupportTickets
                .Where(t => t.Status == SupportTicketStatus.Open || t.Status == SupportTicketStatus.InProgress)
                .ToListAsync();
            var now = DateTime.UtcNow;
            return Results.Ok(new SupportQueueSummary(
                Open: active.Count,
                AwaitingSupport: active.Count(t => t.AwaitingSupport),
                SlaBreached: active.Count(t => SlaDue(t) is DateTime d && d < now),
                Unassigned: active.Count(t => t.AssignedToUserId is null),
                Mine: active.Count(t => t.AssignedToUserId == me)));
        });

        admin.MapGet("/{id:guid}", async (Guid id, PharmaStockDbContext db) =>
        {
            var t = await db.SupportTickets.Include(x => x.Attachments).Include(x => x.Messages).FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            var due = SlaDue(t);
            return Results.Ok(new SupportTicketDetail(t.Id, t.Category, t.Status, t.Title, t.Description,
                t.CreatedAt, t.UpdatedAt, t.ResolvedAt, t.AdminReply, t.RepliedAt,
                t.CompanyId, t.CompanyName, t.UserId, t.UserName, t.UserPhone,
                t.Platform, t.AppVersion, t.DeviceInfo, t.Screen,
                t.Attachments.OrderBy(a => a.CreatedAt).Select(a => new SupportAttachmentInfo(a.Id, a.FileName, a.ContentType, a.SizeBytes)).ToList(),
                t.Priority, t.AssignedToUserId, t.AssignedToName, t.AwaitingSupport, due, due is not null && due < DateTime.UtcNow,
                t.Messages.OrderBy(m => m.CreatedAt).Select(m => new SupportMessageInfo(m.Id, m.AuthorName, m.FromSupport, m.IsInternal, m.Body, m.CreatedAt)).ToList()));
        });

        admin.MapGet("/{id:guid}/attachments/{attachmentId:guid}", async (Guid id, Guid attachmentId, PharmaStockDbContext db) =>
        {
            var a = await db.SupportAttachments.FirstOrDefaultAsync(x => x.Id == attachmentId && x.TicketId == id);
            return a is null ? Results.NotFound() : Results.File(a.Data, a.ContentType, a.FileName);
        });

        admin.MapPost("/{id:guid}/status", async (Guid id, SetSupportStatusRequest request, PharmaStockDbContext db, HttpContext http,
            EmailService email, ILoggerFactory loggerFactory) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            ApplyStatus(t, request.Status);
            // The reporter learns their request was resolved: pop-up in the app
            // on next open, plus an e-mail if their account has one.
            var resolved = request.Status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed;
            if (resolved) t.UnreadByReporter = true;
            Audit(db, http, $"support.status.{request.Status.ToString().ToLowerInvariant()}", t);
            await db.SaveChangesAsync();
            if (resolved) await NotifyReporterAsync(db, t, null, email, loggerFactory);
            return Results.Ok(new { t.Id, t.Status });
        });

        // Public reply to the reporter (shown in their app, flagged unread).
        admin.MapPost("/{id:guid}/reply", async (Guid id, ReplySupportTicketRequest request, PharmaStockDbContext db, HttpContext http,
            EmailService email, ILoggerFactory loggerFactory) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            var reply = request.Reply?.Trim() ?? "";
            if (reply.Length == 0) return Results.BadRequest(new { message = "Réponse vide." });
            if (reply.Length > 8000) reply = reply[..8000];
            var (me, myName) = Actor(http);
            db.SupportMessages.Add(new SupportMessage { TicketId = t.Id, AuthorUserId = me, AuthorName = myName, FromSupport = true, Body = reply });
            t.AdminReply = reply; // latest reply. Kept for older app versions
            t.RepliedAt = DateTime.UtcNow;
            t.UnreadByReporter = true;
            t.AwaitingSupport = false;
            // Answering an unassigned request takes it.
            if (t.AssignedToUserId is null) { t.AssignedToUserId = me; t.AssignedToName = myName; }
            ApplyStatus(t, request.Status ?? (t.Status == SupportTicketStatus.Open ? SupportTicketStatus.InProgress : t.Status));
            Audit(db, http, "support.reply", t);
            await db.SaveChangesAsync();
            await NotifyReporterAsync(db, t, reply, email, loggerFactory);
            return Results.Ok(new { t.Id, t.Status });
        });

        // Internal note — support-only, never shown to the reporter; doesn't
        // count as an answer (the response-time clock keeps running).
        admin.MapPost("/{id:guid}/note", async (Guid id, SupportNoteRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            var body = request.Body?.Trim() ?? "";
            if (body.Length == 0) return Results.BadRequest(new { message = "Note vide." });
            var (me, myName) = Actor(http);
            db.SupportMessages.Add(new SupportMessage
            {
                TicketId = t.Id, AuthorUserId = me, AuthorName = myName, FromSupport = true, IsInternal = true,
                Body = body.Length > 8000 ? body[..8000] : body,
            });
            t.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { t.Id });
        });

        // Take it / release it.
        admin.MapPost("/{id:guid}/assign", async (Guid id, AssignSupportTicketRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            var (me, myName) = Actor(http);
            t.AssignedToUserId = request.ToMe ? me : null;
            t.AssignedToName = request.ToMe ? myName : null;
            if (request.ToMe && t.Status == SupportTicketStatus.Open) t.Status = SupportTicketStatus.InProgress;
            t.UpdatedAt = DateTime.UtcNow;
            Audit(db, http, request.ToMe ? "support.assign" : "support.unassign", t);
            await db.SaveChangesAsync();
            return Results.Ok(new { t.Id, t.AssignedToName, t.Status });
        });

        admin.MapPost("/{id:guid}/priority", async (Guid id, SetSupportPriorityRequest request, PharmaStockDbContext db, HttpContext http) =>
        {
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { message = "Demande introuvable." });
            t.Priority = request.Priority;
            t.UpdatedAt = DateTime.UtcNow;
            Audit(db, http, $"support.priority.{request.Priority.ToString().ToLowerInvariant()}", t);
            await db.SaveChangesAsync();
            return Results.Ok(new { t.Id, t.Priority });
        });
    }

    /// <summary>Close resolved requests the reporter hasn't reacted to within
    /// <see cref="AutoCloseAfter"/> (run lazily when the console loads).</summary>
    private static async Task AutoCloseStaleAsync(PharmaStockDbContext db)
    {
        var cutoff = DateTime.UtcNow - AutoCloseAfter;
        var stale = await db.SupportTickets
            .Where(t => t.Status == SupportTicketStatus.Resolved && t.ResolvedAt != null && t.ResolvedAt < cutoff)
            .ToListAsync();
        if (stale.Count == 0) return;
        foreach (var t in stale)
        {
            t.Status = SupportTicketStatus.Closed;
            t.UpdatedAt = DateTime.UtcNow;
            db.AuditLogs.Add(new AuditLog
            {
                ActorName = "system", Action = "support.autoclose", TargetType = "support", TargetId = t.Id,
                CompanyId = t.CompanyId, Detail = t.Title,
            });
        }
        await db.SaveChangesAsync();
    }

    private static async Task NotifyReporterAsync(PharmaStockDbContext db, SupportTicket t, string? message, EmailService email, ILoggerFactory loggerFactory)
    {
        var reporterEmail = await db.Users.Where(u => u.Id == t.UserId).Select(u => u.Email).FirstOrDefaultAsync();
        SupportNotifier.NotifyReporter(t, message, reporterEmail, email, loggerFactory.CreateLogger("Support"));
    }

    private static (Guid Id, string Name) Actor(HttpContext http) =>
        (http.User.GetUserId() ?? Guid.Empty, http.User.Identity?.Name ?? "Support");

    private static void ApplyStatus(SupportTicket t, SupportTicketStatus status)
    {
        t.Status = status;
        t.UpdatedAt = DateTime.UtcNow;
        t.ResolvedAt = status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed ? (t.ResolvedAt ?? DateTime.UtcNow) : null;
        // A resolved/closed request no longer waits on support.
        if (status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed) t.AwaitingSupport = false;
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
