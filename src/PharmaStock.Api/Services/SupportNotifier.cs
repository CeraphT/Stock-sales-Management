using System.Net;
using PharmaStock.Domain.Models;

namespace PharmaStock.Api.Services;

/// <summary>E-mails the support inbox when a new SupportTicket is filed, with
/// its context and screenshots attached. Recipient: SUPPORT_NOTIFY_EMAIL, else
/// the SMTP sender address. Fire-and-forget — filing a ticket never waits on (or
/// fails because of) SMTP; delivery errors are logged. No-op when SMTP isn't
/// configured (dev).</summary>
public static class SupportNotifier
{
    public static void NotifyNewTicket(SupportTicket ticket, EmailService email, IConfiguration config, ILogger logger)
    {
        if (!email.IsConfigured) return;
        var to = config["SUPPORT_NOTIFY_EMAIL"] ?? email.FromAddress;
        if (string.IsNullOrWhiteSpace(to)) return;
        var consoleUrl = config["SUPPORT_CONSOLE_URL"] ?? "https://stock.mfspace.lu/superadmin/support";

        var category = ticket.Category switch
        {
            SupportTicketCategory.Blocked => "🚨 Bloqué",
            SupportTicketCategory.Question => "❓ Question",
            _ => "🐞 Bug",
        };
        var subject = $"[Support StockFlow] {category} — {ticket.Title}";
        static string E(string? s) => WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(s) ? "—" : s);
        static string Row(string label, string value) =>
            $"<tr><td style=\"color:#6B7280;padding:2px 12px 2px 0\">{label}</td><td>{value}</td></tr>";

        var html =
            "<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\">" +
            $"<h2 style=\"color:#0F766E;margin:0 0 8px\">{E(category)} — {E(ticket.Title)}</h2>" +
            "<table style=\"border-collapse:collapse;font-size:13px;margin:8px 0 12px\">" +
            Row("Entreprise", E(ticket.CompanyName)) +
            Row("Utilisateur", $"{E(ticket.UserName)} · {E(ticket.UserPhone)}") +
            Row("App", $"{E(ticket.Platform.ToString())} {E(ticket.AppVersion)}") +
            Row("Écran", E(ticket.Screen)) +
            Row("Appareil", E(ticket.DeviceInfo)) +
            Row("Reçu le", $"{ticket.CreatedAt:yyyy-MM-dd HH:mm} UTC") +
            "</table>" +
            $"<div style=\"white-space:pre-wrap;border:1px solid #E3E7E5;border-radius:8px;padding:12px\">{E(ticket.Description)}</div>" +
            $"<p style=\"margin-top:14px\">{ticket.Attachments.Count} image(s) jointe(s). " +
            $"<a href=\"{E(consoleUrl)}\" style=\"color:#0F766E;font-weight:600\">Ouvrir la console Support →</a></p>" +
            "</div>";

        var attachments = ticket.Attachments
            .Select(a => new EmailService.Attachment(a.FileName, a.ContentType, a.Data))
            .ToList();

        _ = Task.Run(async () =>
        {
            try
            {
                await email.SendAsync(to, subject, html, attachments);
                logger.LogInformation("Support ticket {TicketId} notification sent to {To}", ticket.Id, to);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Support ticket {TicketId} notification FAILED", ticket.Id);
            }
        });
    }
}
