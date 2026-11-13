using System.Net;
using System.Text;

namespace PharmaStock.Api.Services;

/// <summary>Server-rendered pages of the Claude connector sign-in (OAuth /authorize):
/// phone + password, then the shop picker. Plain HTML with inline CSS, no scripts.
/// French first (primary market), English when the browser asks for it.
/// No em dashes in any text (house rule).</summary>
public static class McpLoginPage
{
    public static bool IsFrench(HttpContext http, string? lang)
    {
        if (!string.IsNullOrWhiteSpace(lang)) return lang != "en";
        var accept = http.Request.Headers.AcceptLanguage.ToString();
        return !accept.TrimStart().StartsWith("en", StringComparison.OrdinalIgnoreCase);
    }

    private static string E(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    private static string Hidden(string name, string? value) =>
        $"<input type=\"hidden\" name=\"{E(name)}\" value=\"{E(value)}\">";

    private static string OAuthFields(McpAuthRequest r, bool fr) =>
        Hidden("client_id", r.ClientId) + Hidden("redirect_uri", r.RedirectUri)
        + Hidden("code_challenge", r.CodeChallenge) + Hidden("code_challenge_method", "S256")
        + Hidden("state", r.State) + Hidden("scope", r.Scope) + Hidden("response_type", "code")
        + Hidden("lang", fr ? "fr" : "en");

    private static string Intro(string clientName, bool fr) => fr
        ? $"<p><b>{E(clientName)}</b> demande à lire les données d'une de vos boutiques StockFlow : ventes, stock, dates de péremption, crédits clients et commandes fournisseurs.</p><p class=\"muted\">Lecture seule : Claude ne peut rien modifier. Vous pourrez couper l'accès à tout moment dans Claude.</p>"
        : $"<p><b>{E(clientName)}</b> is asking to read the data of one of your StockFlow shops: sales, stock, expiry dates, customer credit and purchase orders.</p><p class=\"muted\">Read only: Claude cannot change anything. You can remove access at any time in Claude.</p>";

    public static string Login(McpAuthRequest r, string clientName, bool fr, string? error, string? phone) =>
        Layout(fr, fr ? "Connecter Claude à StockFlow" : "Connect Claude to StockFlow", $"""
            {Intro(clientName, fr)}
            {(error is null ? "" : $"<div class=\"error\">{E(error)}</div>")}
            <form method="post" action="/oauth/authorize" autocomplete="on">
              {OAuthFields(r, fr)}
              <input type="hidden" name="step" value="login">
              <label>{(fr ? "Numéro de téléphone" : "Phone number")}
                <input name="phone" type="tel" required value="{E(phone)}" autocomplete="username" autofocus></label>
              <label>{(fr ? "Mot de passe" : "Password")}
                <input name="password" type="password" required autocomplete="current-password"></label>
              <div class="actions">
                <button type="submit" name="decision" value="allow">{(fr ? "Se connecter" : "Sign in")}</button>
                <button type="submit" name="decision" value="deny" class="secondary" formnovalidate>{(fr ? "Annuler" : "Cancel")}</button>
              </div>
            </form>
            """);

    public static string PickShop(McpAuthRequest r, string ticket, string clientName, string userName,
        IReadOnlyList<(Guid Id, string Name)> shops, bool fr)
    {
        var options = new StringBuilder();
        for (var i = 0; i < shops.Count; i++)
            options.Append($"<label class=\"shop\"><input type=\"radio\" name=\"company_id\" value=\"{shops[i].Id}\"{(i == 0 ? " checked" : "")}> {E(shops[i].Name)}</label>");

        return Layout(fr, fr ? "Choisissez la boutique" : "Choose the shop", $"""
            <p>{(fr ? "Bonjour" : "Hello")} {E(userName)}.</p>
            <p>{(fr
                ? $"Quelle boutique <b>{E(clientName)}</b> pourra-t-il lire ? Une seule boutique par connexion."
                : $"Which shop may <b>{E(clientName)}</b> read? One shop per connection.")}</p>
            <form method="post" action="/oauth/authorize">
              {OAuthFields(r, fr)}
              <input type="hidden" name="step" value="shop">
              {Hidden("ticket", ticket)}
              {options}
              <div class="actions">
                <button type="submit" name="decision" value="allow">{(fr ? "Autoriser" : "Allow")}</button>
                <button type="submit" name="decision" value="deny" class="secondary">{(fr ? "Annuler" : "Cancel")}</button>
              </div>
            </form>
            """);
    }

    public static string Error(string message, bool fr) =>
        Layout(fr, fr ? "Connexion impossible" : "Cannot connect", $"<div class=\"error\">{E(message)}</div>");

    private static string Layout(bool fr, string title, string body) => $$"""
        <!doctype html>
        <html lang="{{(fr ? "fr" : "en")}}">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex">
        <title>StockFlow · {{E(title)}}</title>
        <style>
          :root { --teal:#0f766e; --teal-dark:#115e59; --amber:#f59e0b; --text:#1f2937; --muted:#6b7280; --bg:#f3f4f6; --card:#fff; --border:#d1d5db; }
          * { box-sizing:border-box; }
          body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
          main { max-width:420px; margin:40px auto; padding:0 16px; }
          .card { background:var(--card); border-radius:12px; padding:24px; border:1px solid var(--border); }
          .brand { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--teal); font-size:20px; margin-bottom:16px; }
          .brand span { display:inline-block; width:22px; height:22px; border-radius:5px; background:var(--teal); border-bottom:4px solid var(--amber); }
          h1 { font-size:18px; margin:0 0 12px; }
          p { line-height:1.45; margin:0 0 10px; }
          .muted { color:var(--muted); font-size:14px; }
          label { display:block; margin:14px 0 0; font-size:14px; font-weight:600; }
          input[type=tel], input[type=password] { display:block; width:100%; margin-top:6px; padding:10px 12px; font-size:16px; border:1px solid var(--border); border-radius:8px; }
          label.shop { font-weight:500; font-size:16px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-top:8px; cursor:pointer; }
          .actions { display:flex; gap:10px; margin-top:20px; }
          button { flex:1; padding:11px; font-size:16px; border-radius:8px; border:0; background:var(--teal); color:#fff; cursor:pointer; }
          button:hover { background:var(--teal-dark); }
          button.secondary { background:#fff; color:var(--text); border:1px solid var(--border); }
          .error { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:10px 12px; border-radius:8px; margin:10px 0; }
          footer { text-align:center; color:var(--muted); font-size:12px; margin-top:16px; }
        </style>
        </head>
        <body>
        <main>
          <div class="card">
            <div class="brand"><span></span>StockFlow</div>
            <h1>{{E(title)}}</h1>
            {{body}}
          </div>
          <footer>StockFlow · © mfSPACE.lu</footer>
        </main>
        </body>
        </html>
        """;
}
