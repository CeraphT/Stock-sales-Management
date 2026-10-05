using System.Net;
using PharmaStock.Domain.Models;

namespace PharmaStock.Api.Services;

/// <summary>Support e-mails. To the support inbox (SUPPORT_NOTIFY_EMAIL, else the
/// SMTP sender): a new request, or the reporter's follow-up — each with one-click
/// "Mark resolved" / "In progress" buttons (see SupportEmailActions) and a link to
/// the console. To the reporter (when their account has an e-mail): support
/// replied / their request was resolved — the apps also show it as a pop-up.
/// All fire-and-forget: never delays or fails the request; errors are logged.
/// No-op when SMTP isn't configured (dev).</summary>
public static class SupportNotifier
{
    private static string E(string? s) => WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(s) ? "—" : s);

    private static string Row(string label, string value) =>
        $"<tr><td style=\"color:#6B7280;padding:2px 12px 2px 0\">{label}</td><td>{value}</td></tr>";

    private static string Button(string href, string label, string bg) =>
        $"<a href=\"{E(href)}\" style=\"display:inline-block;background:{bg};color:#fff;text-decoration:none;border-radius:8px;padding:10px 16px;font-weight:700;margin:0 8px 8px 0\">{label}</a>";

    private static string ActionButtons(SupportTicket t, IConfiguration config)
    {
        var consoleUrl = (config["SUPPORT_CONSOLE_URL"] ?? "https://stock.mfspace.lu/superadmin/support") + $"?ticket={t.Id}";
        return "<p style=\"margin-top:16px\">" +
               Button(SupportEmailActions.Link(config, t.Id, "resolve"), "✅ Marquer résolue", "#0F766E") +
               Button(SupportEmailActions.Link(config, t.Id, "inprogress"), "⏳ En cours", "#2563EB") +
               Button(consoleUrl, "Ouvrir dans la console →", "#6B7280") +
               "</p><p style=\"color:#9CA3AF;font-size:12px\">Les boutons ouvrent une page de confirmation où vous pouvez aussi écrire un message à l'utilisateur. Liens valables 14 jours.</p>";
    }

    private static string CategoryLabel(SupportTicketCategory c) => c switch
    {
        SupportTicketCategory.Blocked => "🚨 Bloqué",
        SupportTicketCategory.Question => "❓ Question",
        _ => "🐞 Bug",
    };

    private static string? SupportInbox(EmailService email, IConfiguration config) =>
        email.IsConfigured ? (config["SUPPORT_NOTIFY_EMAIL"] ?? email.FromAddress) : null;

    public static void NotifyNewTicket(SupportTicket ticket, EmailService email, IConfiguration config, ILogger logger)
    {
        var to = SupportInbox(email, config);
        if (string.IsNullOrWhiteSpace(to)) return;
        var category = CategoryLabel(ticket.Category);
        var subject = $"[Support StockFlow] {category} — {ticket.Title}";
        var html =
            "<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\">" +
            $"<h2 style=\"color:#0F766E;margin:0 0 8px\">{E(category)} — {E(ticket.Title)}</h2>" +
            "<table style=\"border-collapse:collapse;font-size:13px;margin:8px 0 12px\">" +
            Row("Priorité", E(ticket.Priority.ToString())) +
            Row("Entreprise", E(ticket.CompanyName)) +
            Row("Utilisateur", $"{E(ticket.UserName)} · {E(ticket.UserPhone)}") +
            Row("App", $"{E(ticket.Platform.ToString())} {E(ticket.AppVersion)}") +
            Row("Écran", E(ticket.Screen)) +
            Row("Appareil", E(ticket.DeviceInfo)) +
            Row("Reçu le", $"{ticket.CreatedAt:yyyy-MM-dd HH:mm} UTC") +
            "</table>" +
            $"<div style=\"white-space:pre-wrap;border:1px solid #E3E7E5;border-radius:8px;padding:12px\">{E(ticket.Description)}</div>" +
            $"<p>{ticket.Attachments.Count} image(s) jointe(s).</p>" +
            ActionButtons(ticket, config) +
            "</div>";
        var attachments = ticket.Attachments.Select(a => new EmailService.Attachment(a.FileName, a.ContentType, a.Data)).ToList();
        Send(email, to, subject, html, attachments, logger, $"new ticket {ticket.Id}");
    }

    public static void NotifyFollowUp(SupportTicket ticket, string message, bool reopened, EmailService email, IConfiguration config, ILogger logger)
    {
        var to = SupportInbox(email, config);
        if (string.IsNullOrWhiteSpace(to)) return;
        var subject = $"[Support StockFlow] {(reopened ? "↩️ Rouverte" : "💬 Réponse")} — {ticket.Title}";
        var html =
            "<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\">" +
            $"<h2 style=\"color:#0F766E;margin:0 0 8px\">{E(ticket.UserName)} a répondu{(reopened ? " (demande rouverte)" : "")}</h2>" +
            $"<p style=\"color:#6B7280\">{E(ticket.CompanyName)} · {E(ticket.Title)}</p>" +
            $"<div style=\"white-space:pre-wrap;border:1px solid #E3E7E5;border-radius:8px;padding:12px\">{E(message)}</div>" +
            ActionButtons(ticket, config) +
            "</div>";
        Send(email, to, subject, html, null, logger, $"follow-up {ticket.Id}");
    }

    /// <summary>To the reporter: support replied (message) and/or the status changed
    /// (resolved…). Only if their account has an e-mail; the apps' pop-up covers
    /// everyone else.</summary>
    public static void NotifyReporter(SupportTicket ticket, string? message, string? reporterEmail, EmailService email, ILogger logger)
    {
        if (!email.IsConfigured || string.IsNullOrWhiteSpace(reporterEmail)) return;
        var resolved = ticket.Status is SupportTicketStatus.Resolved or SupportTicketStatus.Closed;
        var subject = resolved
            ? $"✅ Votre demande est résolue — {ticket.Title}"
            : $"💬 Le support vous a répondu — {ticket.Title}";
        var html =
            "<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\">" +
            $"<h2 style=\"color:#0F766E;margin:0 0 8px\">{(resolved ? "Votre demande est résolue" : "Le support vous a répondu")}</h2>" +
            $"<p>Demande : <b>{E(ticket.Title)}</b> — statut : <b>{SupportEmailActions.StatusFr(ticket.Status)}</b></p>" +
            (string.IsNullOrWhiteSpace(message) ? "" : $"<div style=\"white-space:pre-wrap;border:1px solid #E3E7E5;border-radius:8px;padding:12px\">{E(message)}</div>") +
            "<p style=\"color:#6B7280\">Retrouvez la conversation dans l'application : Aide → Support → Mes demandes. " +
            "Si le problème persiste, répondez-y depuis l'application pour rouvrir la demande.</p></div>";
        Send(email, reporterEmail!, subject, html, null, logger, $"reporter {ticket.Id}");
    }

    private static void Send(EmailService email, string to, string subject, string html, List<EmailService.Attachment>? attachments, ILogger logger, string what)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await email.SendAsync(to, subject, html, attachments);
                logger.LogInformation("Support ticket {What} notification sent to {To}", what, to);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Support ticket {What} notification FAILED", what);
            }
        });
    }
}
