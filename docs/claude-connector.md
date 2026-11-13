# StockFlow connector for Claude

With the StockFlow connector, a shop owner can ask Claude about their shop in plain
language, for example:

- "Combien ai-je vendu cette semaine, et quel est mon bénéfice ?"
- "Quels produits dois-je recommander ?"
- "Qu'est-ce qui expire dans les 30 prochains jours ?"
- "Quels clients me doivent de l'argent ?"
- "Which supplier orders are still waiting to be delivered?"

The connector is **read-only**. Claude can look at the shop's data but cannot sell,
change stock, edit prices or touch anything else.

## For the shop owner: adding the connector

1. Open Claude (claude.ai or the Claude app) and go to **Settings > Connectors**.
2. Click **Add custom connector**.
3. Name: `StockFlow`. URL: `https://api.mfspace.lu/mcp`. Leave the advanced settings empty.
4. Click **Add**, then **Connect**. A StockFlow page opens.
5. Sign in with your StockFlow **phone number and password**, the same as in the app.
6. If your account has several shops, **choose one**. Each connection reads only one shop.
   To use another shop, remove the connector and add it again, choosing the other shop.
7. You are sent back to Claude. In a new chat, make sure StockFlow is turned on in the
   connectors menu, then ask your question.

Custom connectors need a Claude plan that supports them. In a Team or Enterprise
organization, an owner may have to add the connector for the organization first.

### What Claude can see

| Tool | What it returns |
|---|---|
| Shop info | Shop name, currency, branches |
| Sales summary | Revenue, cost, gross profit, number of sales, VAT, day by day, for a date range |
| Top products | Best sellers by revenue for a date range |
| Stock levels | Stock per product, low-stock and out-of-stock items |
| Expiring batches | Batches expiring soon and expired batches that still hold stock |
| Customers with credit | Customers who owe the shop money, with the total |
| Open purchase orders | Supplier orders not yet fully received |

Staff accounts can connect too. A cashier with restrictions in **Staff** (for example
"Reports and full sales") gets the same restrictions in Claude. If someone is removed
from the shop or their account is deactivated, their connector stops working at once.

Every question Claude sends to StockFlow is recorded in the shop's audit log
(`mcp.tool.*`), as is each new connection (`mcp.connect`).

### Privacy

When Claude uses the connector, the data it reads (for example customer names and
phone numbers in the credit list) is sent to Claude to answer the question. Only connect
shops whose data you are comfortable sharing this way.

### Disconnecting

In Claude, go to **Settings > Connectors**, open StockFlow and choose **Disconnect** or
**Remove**. If you change your StockFlow password, the connection keeps working until
you remove it. There is no way yet to disconnect from inside StockFlow.

## For developers

### How it works

- **MCP endpoint:** `POST /mcp`, Streamable HTTP, stateless, official C# SDK
  `ModelContextProtocol.AspNetCore` 2.4.0. Tools: `Services/StockFlowMcpTools.cs`.
  Wiring: `Services/McpSetup.cs`.
- **OAuth 2.1 server** (`Services/McpOAuthEndpoints.cs`), built into the API:
  - `/.well-known/oauth-protected-resource/mcp` (from the SDK) and
    `/.well-known/oauth-authorization-server`
  - `POST /oauth/register`: dynamic client registration, public clients only.
    Allowed redirect URIs are Claude's callbacks (`https://claude.ai/api/mcp/auth_callback`,
    `https://claude.com/api/mcp/auth_callback`), any loopback `http://localhost:*` URI, and
    any extra URI listed in `Mcp:AllowedRedirectUris`.
  - `GET/POST /oauth/authorize`: phone and password, then the shop picker (FR/EN pages
    in `McpLoginPage.cs`). PKCE S256 is required. A phone is locked for 15 minutes
    after 5 wrong passwords. Super-admin accounts cannot connect.
  - `POST /oauth/token`: `authorization_code` and `refresh_token`. Codes are single-use
    and last 5 minutes. Refresh tokens last 30 days, rotate on every use and are stored
    hashed in `McpGrants`.
- **Token:** a JWT signed with `Jwt:Secret`, carrying the usual `company_id` and role
  claims plus `mcp_grant`. Its audience is `PharmaStock.Mcp`, so connector tokens and
  app tokens never work on each other's endpoints.
- **Every tool call** (`McpAccess.BeginAsync`) reloads the grant and the membership. It
  refuses revoked grants and inactive memberships, users or shops. It applies the
  `Restrict*` flags to cashiers and writes an `AuditLog` row, refused calls included.
- **Data:** `sales_summary` and `top_products` use `ReportQueries`, the same code as the
  report endpoints. Login codes and shop-picker tickets live in memory, so a restart
  during sign-in means the person signs in again.
- **Migration:** `AddMcpConnector` adds the `McpClients` and `McpGrants` tables.

### Settings (all optional)

| Key | Default | Use |
|---|---|---|
| `Mcp:PublicBaseUrl` | rebuilt from the request (`X-Forwarded-Proto`/`Host`) | Force the public URL, e.g. `https://api.mfspace.lu` |
| `Mcp:AccessTokenExpiryMinutes` | 60 | Connector access token lifetime |
| `Mcp:RefreshTokenExpiryDays` | 30 | Refresh token lifetime |
| `Mcp:AllowedRedirectUris` | (none) | Extra OAuth redirect URIs, comma-separated |

Caddy's `reverse_proxy` already sends `X-Forwarded-Proto` and `X-Forwarded-Host`, so
production needs no new setting.

### Testing locally

```powershell
cd C:\Dev\PharmaStock\src\PharmaStock.Api; dotnet run --urls http://localhost:5080
node tools/mcp-dev-seed.mjs           # fictional demo shops in the LOCAL DB only
node tools/mcp-e2e-check.mjs          # full OAuth + tools + access-control check
```

MCP Inspector, with a token from the check script:

```powershell
$t = node tools/mcp-e2e-check.mjs --print-token
npx @modelcontextprotocol/inspector --cli http://localhost:5080/mcp --transport http --header "Authorization: Bearer $t" --method tools/list
```

Or run `npx @modelcontextprotocol/inspector` and connect to `http://localhost:5080/mcp`
with its OAuth flow. Its callback `http://localhost:6274/oauth/callback` is allowed.
The demo logins are listed at the top of `tools/mcp-dev-seed.mjs`.

### Not in this version

- Write tools (record a sale, receive stock). Each one would need its own review.
- A "connected apps" list in StockFlow where the owner can see and revoke connections.
- HouseBudget.
