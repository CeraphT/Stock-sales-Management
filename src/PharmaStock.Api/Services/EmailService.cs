using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace PharmaStock.Api.Services;

/// <summary>Sends email over SMTP configured via environment variables
/// (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). Same proven setup as
/// HouseBudget's EmailService: MailKit — NOT the legacy System.Net.Mail
/// SmtpClient, which over STARTTLS on 587 can complete without throwing yet never
/// deliver. Security mode by port (465 = implicit TLS, else STARTTLS), 30 s
/// timeout, real exceptions.</summary>
public class EmailService
{
    private readonly IConfiguration _config;
    public EmailService(IConfiguration config) => _config = config;

    private string? Get(string key) => _config[key] ?? Environment.GetEnvironmentVariable(key);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Get("SMTP_HOST"));

    /// <summary>The configured sender address (SMTP_FROM, else SMTP_USER).</summary>
    public string? FromAddress => Get("SMTP_FROM") ?? Get("SMTP_USER");

    public record Attachment(string FileName, string ContentType, byte[] Content);

    public async Task SendAsync(string to, string subject, string htmlBody, IEnumerable<Attachment>? attachments = null, string? replyTo = null)
    {
        var host = Get("SMTP_HOST");
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("L'envoi d'e-mails n'est pas configuré (SMTP).");
        var port = int.TryParse(Get("SMTP_PORT"), out var p) ? p : 587;
        var user = Get("SMTP_USER");
        var pass = Get("SMTP_PASS");
        var from = FromAddress ?? "no-reply@stockflow.app";
        var security = port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;

        var msg = new MimeMessage();
        msg.From.Add(MailboxAddress.Parse(from));
        msg.To.Add(MailboxAddress.Parse(to));
        msg.Subject = subject ?? "";
        if (!string.IsNullOrWhiteSpace(replyTo) && replyTo != from)
            try { msg.ReplyTo.Add(MailboxAddress.Parse(replyTo.Trim())); } catch { /* ignore a malformed address */ }

        var builder = new BodyBuilder { HtmlBody = htmlBody ?? "" };
        if (attachments is not null)
            foreach (var a in attachments)
                builder.Attachments.Add(a.FileName, a.Content, ContentType.Parse(a.ContentType));
        msg.Body = builder.ToMessageBody();

        using var client = new SmtpClient();
        client.Timeout = 30_000; // a hung connection must surface as an error
        await client.ConnectAsync(host, port, security);
        if (!string.IsNullOrWhiteSpace(user))
            await client.AuthenticateAsync(user, pass);
        try { await client.SendAsync(msg); }
        finally { await client.DisconnectAsync(true); }
    }
}
