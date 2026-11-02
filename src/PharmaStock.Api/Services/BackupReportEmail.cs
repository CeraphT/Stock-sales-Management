using System.Globalization;
using System.Net;
using System.Text;
using PharmaStock.Domain.Models;

namespace PharmaStock.Api.Services;

/// <summary>Renders the daily backup report e-mail: status and last-success bars,
/// KPI tiles, the per-source table with its 28-day colour bar, row counts per
/// feature of both apps, and a link to the super-admin Backups page where the
/// files are downloaded (login required, nothing downloadable from the e-mail).
/// E-mail-safe HTML only: tables, inline styles, no CSS classes or scripts.</summary>
public static class BackupReportEmail
{
    private static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");

    private const string Font = "font-family:Segoe UI,Arial,Helvetica,sans-serif";
    private const string Ink = "#1F2937";
    private const string Muted = "#6B7280";
    private const string Line = "#E3E3E3";
    private const string Track = "#F2F2F2";
    private const string Brand = "#0F766E";

    public static string Color(BackupState? s) => s switch
    {
        BackupState.Completed => "#55C443",
        BackupState.CompletedWithErrors => "#F59E0B",
        BackupState.InProcess => "#F2E205",
        BackupState.Unsuccessful => "#F04A2E",
        BackupState.NoBackup => "#9CA3AF",
        _ => "#C9C9C9",
    };

    /// <summary>Lighter shade for the alternating stripes of the 28-day bar.</summary>
    private static string Tint(BackupState? s) => s switch
    {
        BackupState.Completed => "#8FDA83",
        BackupState.CompletedWithErrors => "#FBC56A",
        BackupState.InProcess => "#F7EE70",
        BackupState.Unsuccessful => "#F7897A",
        BackupState.NoBackup => "#C4C8CE",
        _ => "#E1E1E1",
    };

    public static string Label(BackupState s) => s switch
    {
        BackupState.Completed => "Terminée",
        BackupState.CompletedWithErrors => "Terminée avec erreurs",
        BackupState.InProcess => "En cours",
        BackupState.Unsuccessful => "Échec",
        _ => "Aucune sauvegarde",
    };

    public static string Size(long? bytes)
    {
        if (bytes is null) return "-";
        string[] units = ["o", "Ko", "Mo", "Go", "To"];
        double v = bytes.Value;
        var u = 0;
        while (v >= 1024 && u < units.Length - 1) { v /= 1024; u++; }
        return (u == 0 ? v.ToString("0", Fr) : v.ToString(v < 10 ? "0.##" : "0.#", Fr)) + " " + units[u];
    }

    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
    private static string N(long n) => n.ToString("N0", Fr);

    public static (string Subject, string Html) Build(BackupReport report)
    {
        var sources = report.Sources;
        var ok = sources.Count(s => s.State == BackupState.Completed);
        var problems = sources.Count(s => s.State is BackupState.Unsuccessful or BackupState.CompletedWithErrors or BackupState.NoBackup);
        var date = report.GeneratedAt.ToString("dd/MM/yyyy", Fr);
        var subject = problems == 0
            ? $"[Sauvegardes] ✅ {ok}/{sources.Count} OK · {date}"
            : $"[Sauvegardes] ⚠️ {problems} problème(s) sur {sources.Count} · {date}";

        var html = new StringBuilder();
        html.Append($"<div style=\"{Font};font-size:13px;color:{Ink};background:#FFFFFF;padding:8px 4px\">");
        html.Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:1180px\"><tr><td>");

        // Header + download button.
        html.Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>");
        html.Append($"<td style=\"padding:4px 0 18px\"><div style=\"font-size:20px;font-weight:700;color:{Brand}\">Rapport quotidien des sauvegardes</div>");
        html.Append($"<div style=\"color:{Muted};margin-top:2px\">StockFlow + HouseBudget · serveur mfSPACE · {report.GeneratedAt.ToString("dddd dd MMMM yyyy, HH:mm", Fr)} UTC</div></td>");
        html.Append($"<td align=\"right\" style=\"padding:4px 0 18px\">{Button(report.ConsoleUrl, "⬇ Télécharger les sauvegardes")}</td>");
        html.Append("</tr></table>");

        AppendKpiTiles(html, report);

        // Status distribution (same buckets and colours as the reference report).
        html.Append(Heading("ÉTAT DES SAUVEGARDES"));
        html.Append(BarTable(new[]
        {
            ("Aucune sauvegarde", sources.Count(s => s.State == BackupState.NoBackup), Color(BackupState.NoBackup)),
            ("Terminée", sources.Count(s => s.State == BackupState.Completed), Color(BackupState.Completed)),
            ("Terminée avec erreurs", sources.Count(s => s.State == BackupState.CompletedWithErrors), Color(BackupState.CompletedWithErrors)),
            ("En cours", sources.Count(s => s.State == BackupState.InProcess), Color(BackupState.InProcess)),
            ("Échec", sources.Count(s => s.State == BackupState.Unsuccessful), Color(BackupState.Unsuccessful)),
        }, sources.Count));

        html.Append(Heading("DERNIÈRE SAUVEGARDE RÉUSSIE"));
        var now = report.GeneratedAt;
        int Bucket(Func<TimeSpan, bool> match) => sources.Count(s => s.LastSuccessAt is { } t && match(now - t));
        html.Append(BarTable(new[]
        {
            ("Aucune sauvegarde réussie", sources.Count(s => s.LastSuccessAt is null), "#9CA3AF"),
            ("Il y a moins de 24 h", Bucket(a => a.TotalHours < 24), "#55C443"),
            ("Il y a moins de 48 h", Bucket(a => a.TotalHours is >= 24 and < 48), "#F59E0B"),
            ("Il y a plus de 48 h", Bucket(a => a.TotalHours >= 48), "#F04A2E"),
        }, sources.Count));

        AppendSourcesTable(html, report);
        AppendFeatureKpis(html, report);

        html.Append($"<p style=\"margin:28px 0 6px\">{Button(report.ConsoleUrl, "⬇ Télécharger les sauvegardes")}</p>");
        html.Append($"<p style=\"color:{Muted};font-size:11px;line-height:1.5;margin:8px 0 0\">" +
                    "Les fichiers se téléchargent depuis la console Super Admin (connexion requise). " +
                    "Restauration d'une base : <span style=\"font-family:Consolas,monospace\">pg_restore -d &lt;base&gt; &lt;fichier&gt;.dump</span>. " +
                    "Sauvegardes : pg_dump des deux bases à 03:30 UTC (14 jours sur le serveur), exports HouseBudget par bien à 02:00 UTC (30 jours), copie quotidienne sur le PC (60 jours).<br>" +
                    "© mfSPACE.lu</p>");
        html.Append("</td></tr></table></div>");
        return (subject, html.ToString());
    }

    private static string Button(string href, string label) =>
        $"<a href=\"{E(href)}\" style=\"display:inline-block;background:{Brand};color:#FFFFFF;text-decoration:none;border-radius:6px;padding:9px 16px;font-weight:700;font-size:13px\">{E(label)}</a>";

    private static string Heading(string text) =>
        $"<div style=\"color:#555555;font-size:12px;letter-spacing:.3px;margin:26px 0 12px\">{E(text)}</div>";

    /// <summary>Label · count · horizontal bar · percentage rows.</summary>
    private static string BarTable(IEnumerable<(string Label, int Count, string Color)> rows, int total)
    {
        var sb = new StringBuilder("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse\">");
        foreach (var (label, count, color) in rows)
        {
            var pct = total == 0 ? 0 : count * 100.0 / total;
            sb.Append("<tr>");
            sb.Append($"<td style=\"width:170px;padding:4px 0;font-size:12.5px\">{E(label)}</td>");
            sb.Append($"<td style=\"width:24px;padding:4px 10px 4px 0;font-weight:700;text-align:right;font-size:12.5px\">{count}</td>");
            sb.Append("<td style=\"width:320px;padding:4px 0\">").Append(Bar(pct, color, 320, 15)).Append("</td>");
            sb.Append($"<td style=\"width:90px;padding:4px 0;text-align:right;font-size:12.5px\">{pct.ToString("0.0", CultureInfo.InvariantCulture)}%</td>");
            sb.Append("</tr>");
        }
        return sb.Append("</table>").ToString();
    }

    private static string Bar(double pct, string color, int width, int height)
    {
        var filled = (int)Math.Round(width * Math.Clamp(pct, 0, 100) / 100.0);
        var sb = new StringBuilder($"<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"{width}\" style=\"border-collapse:collapse;width:{width}px\"><tr>");
        if (filled > 0) sb.Append($"<td width=\"{filled}\" height=\"{height}\" bgcolor=\"{color}\" style=\"width:{filled}px;height:{height}px;background:{color};font-size:0;line-height:0\">&nbsp;</td>");
        if (filled < width) sb.Append($"<td height=\"{height}\" bgcolor=\"{Track}\" style=\"height:{height}px;background:{Track};font-size:0;line-height:0\">&nbsp;</td>");
        return sb.Append("</tr></table>").ToString();
    }

    private static void AppendKpiTiles(StringBuilder html, BackupReport report)
    {
        var s = report.Sources;
        var ok = s.Count(x => x.State == BackupState.Completed);
        var newest = s.Where(x => x.Key.StartsWith("pg:") && x.LastSuccessAt is not null).Select(x => x.LastSuccessAt!.Value).DefaultIfEmpty().Max();
        var storage = s.Sum(x => x.StorageBytes ?? 0);
        var rows = s.SelectMany(x => x.Kpis).Sum(k => k.Count);
        var errors = s.Sum(x => x.ErrorCount);
        var tiles = new[]
        {
            ("Sources à jour", $"{ok}/{s.Count}", ok == s.Count ? "#55C443" : "#F04A2E"),
            ("Dernier pg_dump", newest == default ? "-" : $"il y a {BackupStatusCollector.Age(report.GeneratedAt - newest)}", Brand),
            ("Stockage des sauvegardes", Size(storage), Brand),
            ("Lignes sauvegardées", N(rows), Brand),
            ("Erreurs (28 jours)", errors.ToString(), errors == 0 ? "#55C443" : "#F04A2E"),
        };
        html.Append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:separate;border-spacing:0 0\"><tr>");
        foreach (var (label, value, color) in tiles)
            html.Append($"<td style=\"padding:0 10px 0 0\"><div style=\"border:1px solid {Line};border-top:3px solid {color};border-radius:6px;padding:10px 14px;min-width:150px\">" +
                        $"<div style=\"color:{Muted};font-size:11px;text-transform:uppercase;letter-spacing:.3px\">{E(label)}</div>" +
                        $"<div style=\"font-size:20px;font-weight:700;margin-top:4px\">{E(value)}</div></div></td>");
        html.Append("</tr></table>");
    }

    private static void AppendSourcesTable(StringBuilder html, BackupReport report)
    {
        var n = report.Sources.Count;
        html.Append(Heading($"SOURCES DE SAUVEGARDE (1-{n} sur {n})"));
        const string th = "text-align:left;vertical-align:top;font-weight:700;font-size:12px;padding:8px 10px;border:1px solid " + Line;
        const string td = "vertical-align:middle;font-size:11.5px;padding:7px 10px;border:1px solid " + Line;
        html.Append($"<table cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border-collapse:collapse;border:1px solid {Line}\">");
        html.Append("<tr bgcolor=\"#F5F5F5\" style=\"background:#F5F5F5\">");
        html.Append("<td style=\"width:6px;padding:0;border:1px solid " + Line + "\"></td>");
        foreach (var h in new[] { "Source", "Emplacement", "Application", "Type", "Données sauvegardées", "Taille des données", "Stockage utilisé", "Historique - 28 derniers jours", "État", "Nombre d'erreurs" })
            html.Append($"<td style=\"{th}\">{E(h)}</td>");
        html.Append("</tr>");

        foreach (var s in report.Sources)
        {
            var color = Color(s.State);
            var link = s.Downloadable ? $"{report.ConsoleUrl}?source={Uri.EscapeDataString(s.Key)}" : null;
            var name = link is null ? E(s.Name)
                : $"<a href=\"{E(link)}\" style=\"color:{Ink};text-decoration:none\">{E(s.Name)}</a>";
            var data = s.DataSources.Count <= 6 ? string.Join(",<br>", s.DataSources.Select(E))
                : string.Join(", ", s.DataSources.Take(5).Select(E)) + $",<br>+ {s.DataSources.Count - 5} autres";
            var last = s.LastSuccessAt is { } t ? $"<div style=\"color:{Muted};font-size:10.5px;margin-top:2px\">{t.ToString("dd/MM HH:mm", Fr)} UTC</div>" : "";
            var note = s.Note is null ? "" : $"<div style=\"color:{color};font-size:10.5px;margin-top:2px\">{E(s.Note)}</div>";

            html.Append("<tr>");
            html.Append($"<td bgcolor=\"{color}\" style=\"width:6px;padding:0;background:{color};border:1px solid {Line}\"></td>");
            html.Append($"<td style=\"{td}\">{name}</td>");
            html.Append($"<td style=\"{td}\">{E(s.Location)}</td>");
            html.Append($"<td style=\"{td}\">{E(s.Application)}</td>");
            html.Append($"<td style=\"{td}\">{E(s.Type)}</td>");
            html.Append($"<td style=\"{td};line-height:1.45\">{data}</td>");
            html.Append($"<td style=\"{td};white-space:nowrap\">{Size(s.DataSizeBytes)}</td>");
            html.Append($"<td style=\"{td};white-space:nowrap\">{Size(s.StorageBytes)}</td>");
            html.Append($"<td style=\"{td}\">{HistoryBar(s.History)}</td>");
            html.Append($"<td style=\"{td}\">{E(Label(s.State))}{last}{note}</td>");
            html.Append($"<td style=\"{td}\">{s.ErrorCount}</td>");
            html.Append("</tr>");
        }
        html.Append("</table>");
    }

    /// <summary>The striped 28-day bar: one thin cell per day, alternating shades.</summary>
    private static string HistoryBar(List<BackupState?> history)
    {
        var sb = new StringBuilder("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse\"><tr>");
        for (var i = 0; i < history.Count; i++)
        {
            var c = i % 2 == 0 ? Color(history[i]) : Tint(history[i]);
            sb.Append($"<td width=\"4\" height=\"14\" bgcolor=\"{c}\" style=\"width:4px;height:14px;background:{c};font-size:0;line-height:0\">&nbsp;</td>");
        }
        return sb.Append("</tr></table>").ToString();
    }

    /// <summary>Row counts per feature of each app, with the change since
    /// yesterday's report. Bars use a square-root scale so small tables stay visible.</summary>
    private static void AppendFeatureKpis(StringBuilder html, BackupReport report)
    {
        foreach (var s in report.Sources.Where(x => x.Kpis.Count > 0))
        {
            html.Append(Heading($"DONNÉES SAUVEGARDÉES · {s.Application.ToUpperInvariant()} ({s.Name})"));
            var max = Math.Sqrt(Math.Max(1, s.Kpis.Max(k => k.Count)));
            html.Append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse\">");
            foreach (var k in s.Kpis)
            {
                var pct = Math.Sqrt(k.Count) * 100 / max;
                var delta = k.Delta switch
                {
                    null => "",
                    0 => $"<span style=\"color:{Muted}\">=</span>",
                    > 0 => $"<span style=\"color:#2F9E2F\">+{N(k.Delta.Value)}</span>",
                    _ => $"<span style=\"color:#D93A22\">{N(k.Delta.Value)}</span>",
                };
                html.Append("<tr>");
                html.Append($"<td style=\"width:170px;padding:3px 0;font-size:12.5px\">{E(k.Label)}</td>");
                html.Append($"<td style=\"width:70px;padding:3px 10px 3px 0;font-weight:700;text-align:right;font-size:12.5px\">{N(k.Count)}</td>");
                html.Append("<td style=\"width:320px;padding:3px 0\">").Append(Bar(pct, Brand, 320, 12)).Append("</td>");
                html.Append($"<td style=\"width:90px;padding:3px 0 3px 10px;font-size:12px\">{delta}</td>");
                html.Append("</tr>");
            }
            html.Append("</table>");
        }
    }
}
