using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>One-click handling of a support request straight from the
/// notification e-mail: "Mark resolved" / "In progress" buttons carry a signed,
/// expiring link (HMAC-SHA256 over ticket + action + expiry with the API's JWT
/// secret — no login needed, can't be forged or reused for another ticket).
///
/// The link opens a confirmation page (GET) and only the page's button applies
/// the change (POST): mail clients and security scanners pre-fetch links, so a
/// GET must never change anything. The page also lets the admin write a message
/// to the reporter, who is then notified (in-app pop-up + e-mail if known).</summary>
public static class SupportEmailActions
{
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromDays(14);

    public static readonly Dictionary<string, (SupportTicketStatus Status, string LabelFr)> Actions = new()
    {
        ["resolve"] = (SupportTicketStatus.Resolved, "Marquer comme résolue"),
        ["inprogress"] = (SupportTicketStatus.InProgress, "Marquer en cours"),
    };

    private static string Secret(IConfiguration config) =>
        config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret is not configured.");

    private static string Sign(IConfiguration config, Guid ticketId, string action, long exp)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("support-email-action:" + Secret(config)));
        var mac = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{ticketId:N}|{action}|{exp}"));
        return Convert.ToBase64String(mac).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    /// <summary>Absolute link for an e-mail button.</summary>
    public static string Link(IConfiguration config, Guid ticketId, string action)
    {
        var apiBase = (config["SUPPORT_API_URL"] ?? "https://api.mfspace.lu").TrimEnd('/');
        var exp = DateTimeOffset.UtcNow.Add(LinkLifetime).ToUnixTimeSeconds();
        return $"{apiBase}/api/support/email-action?id={ticketId:N}&a={action}&exp={exp}&sig={Sign(config, ticketId, action, exp)}";
    }

    private static bool Valid(IConfiguration config, Guid id, string action, long exp, string sig) =>
        Actions.ContainsKey(action)
        && DateTimeOffset.UtcNow.ToUnixTimeSeconds() <= exp
        && CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(Sign(config, id, action, exp)), Encoding.UTF8.GetBytes(sig ?? ""));

    public static void MapSupportEmailActions(this WebApplication app)
    {
        // Confirmation page (safe: changes nothing).
        app.MapGet("/api/support/email-action", async (Guid id, string a, long exp, string sig, PharmaStockDbContext db, IConfiguration config) =>
        {
            if (!Valid(config, id, a, exp, sig)) return Page("Lien invalide ou expiré", "<p>Ce lien n'est plus valide. Ouvrez la demande depuis la console Support.</p>", 400);
            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Page("Demande introuvable", "<p>Cette demande n'existe plus.</p>", 404);
            var (_, label) = Actions[a];
            var e = (string? s) => WebUtility.HtmlEncode(s ?? "");
            var form = $@"
<p style=""color:#6B7280"">{e(t.CompanyName ?? "Sans entreprise")} · {e(t.UserName)} · statut actuel : <b>{StatusFr(t.Status)}</b></p>
<div style=""white-space:pre-wrap;border:1px solid #E3E7E5;border-radius:8px;padding:12px;margin:12px 0"">{e(t.Description)}</div>
<form method=""post"" action=""/api/support/email-action"">
  <input type=""hidden"" name=""id"" value=""{id:N}""><input type=""hidden"" name=""a"" value=""{e(a)}"">
  <input type=""hidden"" name=""exp"" value=""{exp}""><input type=""hidden"" name=""sig"" value=""{e(sig)}"">
  <label style=""display:block;font-weight:600;margin:8px 0 4px"">Message à l'utilisateur (facultatif)</label>
  <textarea name=""message"" rows=""4"" style=""width:100%;box-sizing:border-box;border:1px solid #E3E7E5;border-radius:8px;padding:10px;font:inherit""
    placeholder=""Ex. : C'est corrigé — mettez l'application à jour.""></textarea>
  <p style=""color:#6B7280;font-size:13px"">L'utilisateur sera prévenu (fenêtre dans l'application, et e-mail si son adresse est connue).</p>
  <button type=""submit"" style=""background:#0F766E;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px;cursor:pointer"">{e(label)}</button>
</form>";
            return Page(t.Title, form);
        }).AllowAnonymous();

        // Applies the change (from the page's button).
        app.MapPost("/api/support/email-action", async (HttpRequest req, PharmaStockDbContext db, IConfiguration config,
            EmailService email, ILoggerFactory loggerFactory) =>
        {
            var f = await req.ReadFormAsync();
            if (!Guid.TryParse(f["id"], out var id) || !long.TryParse(f["exp"], out var exp))
                return Page("Lien invalide", "<p>Requête incomplète.</p>", 400);
            string a = f["a"].ToString(), sig = f["sig"].ToString(), message = f["message"].ToString().Trim();
            if (!Valid(config, id, a, exp, sig)) return Page("Lien invalide ou expiré", "<p>Ce lien n'est plus valide.</p>", 400);

            var t = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Page("Demande introuvable", "<p>Cette demande n'existe plus.</p>", 404);
            var (status, _) = Actions[a];

            if (message.Length > 0)
            {
                if (message.Length > 8000) message = message[..8000];
                db.SupportMessages.Add(new SupportMessage { TicketId = t.Id, AuthorUserId = Guid.Empty, AuthorName = "Support", FromSupport = true, Body = message });
                t.AdminReply = message;
                t.RepliedAt = DateTime.UtcNow;
            }
            t.Status = status;
            t.UpdatedAt = DateTime.UtcNow;
            t.ResolvedAt = status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed ? (t.ResolvedAt ?? DateTime.UtcNow) : null;
            if (status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed || message.Length > 0) t.AwaitingSupport = false;
            t.UnreadByReporter = true; // in-app pop-up on the reporter's next app open
            db.AuditLogs.Add(new AuditLog
            {
                ActorName = "support (lien e-mail)", Action = $"support.email.{a}", TargetType = "support", TargetId = t.Id,
                CompanyId = t.CompanyId, Ip = req.HttpContext.GetClientIp(), Detail = t.Title,
            });
            await db.SaveChangesAsync();

            var reporterEmail = await db.Users.Where(u => u.Id == t.UserId).Select(u => u.Email).FirstOrDefaultAsync();
            SupportNotifier.NotifyReporter(t, message.Length > 0 ? message : null, reporterEmail, email, loggerFactory.CreateLogger("Support"));

            return Page("C'est fait ✅", $"<p>La demande « {WebUtility.HtmlEncode(t.Title)} » est maintenant <b>{StatusFr(t.Status)}</b>. L'utilisateur a été prévenu.</p>");
        }).AllowAnonymous().DisableAntiforgery();
    }

    public static string StatusFr(SupportTicketStatus s) => s switch
    {
        SupportTicketStatus.InProgress => "en cours",
        SupportTicketStatus.Resolved => "résolue",
        SupportTicketStatus.Closed => "fermée",
        _ => "ouverte",
    };

    private static IResult Page(string title, string body, int status = 200) => Results.Content(
        $@"<!doctype html><html lang=""fr""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1"">
<title>{WebUtility.HtmlEncode(title)} — Support StockFlow</title></head>
<body style=""margin:0;background:#F5F8F7;font-family:Segoe UI,Arial,sans-serif;color:#1F2937"">
<div style=""max-width:640px;margin:32px auto;background:#fff;border:1px solid #E3E7E5;border-radius:14px;padding:24px"">
<div style=""color:#0F766E;font-weight:800;margin-bottom:8px"">Support StockFlow</div>
<h1 style=""font-size:20px;margin:0 0 8px"">{WebUtility.HtmlEncode(title)}</h1>{body}</div></body></html>",
        "text/html; charset=utf-8", Encoding.UTF8, status);
}
