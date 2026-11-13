// End-to-end check of the Claude connector against a LOCAL API seeded with
// tools/mcp-dev-seed.mjs. Plays Claude's part: discovery, dynamic registration,
// sign-in + shop picker, PKCE code exchange, every tool, refresh rotation, and the
// access-control cases (restricted cashier, token cross-use, bad PKCE).
//
//   node tools/mcp-e2e-check.mjs [http://localhost:5080]
//   node tools/mcp-e2e-check.mjs [api] --print-token   (prints a fresh owner access token, for the MCP Inspector)

import { createHash, randomBytes } from "node:crypto";

const API = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:5080";
const PRINT_TOKEN = process.argv.includes("--print-token");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error("Local API only");
const REDIRECT = "http://localhost:6274/oauth/callback";

let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  if (!PRINT_TOKEN) console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
};
const b64url = (buf) => buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function form(path, fields) {
  return fetch(API + path, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept-Language": "fr" },
    body: new URLSearchParams(fields),
  });
}

let rpcId = 0;
async function mcp(token, method, params) {
  const res = await fetch(API + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18", ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  let body = null;
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    body = data.length ? JSON.parse(data[data.length - 1]) : null;
  } else if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: res.status, headers: res.headers, body };
}

async function connect(phone, password, pickShopName) {
  const reg = await fetch(API + "/oauth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "E2E check", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
  }).then((r) => r.json());
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const oauth = {
    client_id: reg.client_id, redirect_uri: REDIRECT, response_type: "code",
    code_challenge: challenge, code_challenge_method: "S256", state: "st-123", scope: "stockflow.read", lang: "fr",
  };
  let res = await form("/oauth/authorize", { ...oauth, step: "login", phone, password, decision: "allow" });
  if (res.status === 200) {
    const html = await res.text();
    const ticket = html.match(/name="ticket" value="([^"]+)"/)?.[1];
    const shops = [...html.matchAll(/name="company_id" value="([^"]+)"[^>]*> ([^<]+)<\/label>/g)].map((m) => ({ id: m[1], name: m[2] }));
    const shop = shops.find((s) => s.name === pickShopName) ?? shops[0];
    if (!ticket) throw new Error("No shop picker: " + html.slice(0, 400));
    res = await form("/oauth/authorize", { ...oauth, step: "shop", ticket, company_id: shop.id, decision: "allow" });
  }
  const location = new URL(res.headers.get("location"));
  const code = location.searchParams.get("code");
  const tokenRes = await form("/oauth/token", {
    grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier,
  });
  return { reg, location, tokens: await tokenRes.json(), tokenStatus: tokenRes.status };
}

// ---- Discovery -------------------------------------------------------------
const unauth = await mcp(null, "tools/list", {});
const wwwAuth = unauth.headers.get("www-authenticate") ?? "";
check(unauth.status === 401 && wwwAuth.includes("resource_metadata"), "401 + WWW-Authenticate resource_metadata on /mcp", wwwAuth);
const prm = await fetch(API + "/.well-known/oauth-protected-resource/mcp").then((r) => r.json());
check(prm.resource === API + "/mcp" && prm.authorization_servers?.[0] === API, "protected resource metadata", JSON.stringify(prm));
const asm = await fetch(API + "/.well-known/oauth-authorization-server").then((r) => r.json());
check(asm.registration_endpoint && asm.code_challenge_methods_supported?.includes("S256"), "authorization server metadata");

// ---- Registration rules ----------------------------------------------------
const badReg = await fetch(API + "/oauth/register", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }),
});
check(badReg.status === 400, "registration refuses a non-allowed redirect URI");

// ---- Owner: sign-in, shop picker, code exchange -----------------------------
const owner = await connect("699000101", "demo-owner-2026", "Boutique Demo Akwa");
check(owner.location.searchParams.get("state") === "st-123", "redirect keeps state");
check(owner.tokenStatus === 200 && owner.tokens.access_token && owner.tokens.refresh_token, "code exchange returns tokens");
const token = owner.tokens.access_token;
if (PRINT_TOKEN) { console.log(token); process.exit(0); }

const init = await mcp(token, "initialize", {
  protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" },
});
check(init.status === 200 && init.body?.result?.serverInfo?.name === "StockFlow", "initialize", init.body?.result?.protocolVersion);

const list = await mcp(token, "tools/list", {});
const names = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
check(names.join() === "customers_with_credit,expiring_batches,open_purchase_orders,sales_summary,shop_info,stock_levels,top_products",
  "tools/list has the 7 read-only tools", names.join());
check((list.body?.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true), "every tool is annotated read-only");

async function tool(tk, name, args = {}) {
  const r = await mcp(tk, "tools/call", { name, arguments: args });
  const result = r.body?.result;
  const text = result?.content?.[0]?.text;
  let data = result?.structuredContent ?? null;
  if (!data && text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { isError: !!result?.isError, data, text, raw: r };
}

const info = await tool(token, "shop_info");
check(!info.isError && info.data.shop === "Boutique Demo Akwa" && info.data.currency === "XAF", "shop_info scoped to the picked shop", info.data?.shop);
const sales = await tool(token, "sales_summary");
check(!sales.isError && sales.data.salesCount === 4 && sales.data.totalRevenue > 0, "sales_summary", `count=${sales.data?.salesCount} revenue=${sales.data?.totalRevenue}`);
const salesBranch = await tool(token, "sales_summary", { branch: "akwa" });
check(!salesBranch.isError && salesBranch.data.salesCount === 4, "sales_summary by branch name");
const badBranch = await tool(token, "sales_summary", { branch: "Nowhere" });
check(badBranch.isError && /Unknown branch/.test(badBranch.text), "unknown branch gives a clear error");
const top = await tool(token, "top_products", { limit: 3 });
check(!top.isError && top.data.products.length === 3, "top_products", top.data?.products?.map((p) => p.product).join(" | "));
const low = await tool(token, "stock_levels", { onlyLowOrOut: true });
const lowNames = low.data?.products?.map((p) => `${p.product}=${p.status}`).join(" | ");
check(!low.isError && low.data.outOfStockCount === 1 && low.data.products.some((p) => p.product.startsWith("Savon")), "stock_levels low/out", lowNames);
const exp = await tool(token, "expiring_batches", { withinDays: 30 });
check(!exp.isError && exp.data.expiredCount === 1 && exp.data.expiringSoonCount === 1, "expiring_batches", exp.data?.batches?.map((b) => `${b.batch}:${b.daysLeft}`).join(" "));
const credit = await tool(token, "customers_with_credit");
check(!credit.isError && credit.data.customersOwing === 1 && credit.data.totalOwed > 0, "customers_with_credit", `owed=${credit.data?.totalOwed}`);
const pos = await tool(token, "open_purchase_orders");
check(!pos.isError && pos.data.openOrders === 1 && pos.data.orders[0].valueStillToReceive === 32400, "open_purchase_orders", `toReceive=${pos.data?.orders?.[0]?.valueStillToReceive}`);
const badDate = await tool(token, "sales_summary", { from: "13/11/2026" });
check(badDate.isError, "bad date format is rejected");

// ---- Token separation ------------------------------------------------------
const meWithMcpToken = await fetch(`${API}/api/me/companies`, { headers: { Authorization: `Bearer ${token}` } });
check(meWithMcpToken.status === 401, "connector token is refused by the normal API", String(meWithMcpToken.status));
const login = await fetch(`${API}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "699000101", password: "demo-owner-2026", deviceId: crypto.randomUUID(), deviceName: "e2e", platform: 2 }),
}).then((r) => r.json());
const appTokenOnMcp = await mcp(login.token, "tools/list", {});
check(appTokenOnMcp.status === 401, "app token is refused by /mcp", String(appTokenOnMcp.status));

// ---- Refresh rotation ------------------------------------------------------
const refreshed = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: owner.tokens.refresh_token, client_id: owner.reg.client_id });
const refreshedBody = await refreshed.json();
check(refreshed.status === 200 && refreshedBody.access_token && refreshedBody.refresh_token !== owner.tokens.refresh_token, "refresh returns a new token pair");
const reused = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: owner.tokens.refresh_token, client_id: owner.reg.client_id });
check(reused.status === 400, "old refresh token no longer works");

// ---- Code replay and PKCE --------------------------------------------------
const replay = await form("/oauth/token", {
  grant_type: "authorization_code", code: owner.location.searchParams.get("code"), redirect_uri: REDIRECT,
  client_id: owner.reg.client_id, code_verifier: "x".repeat(43),
});
check(replay.status === 400, "authorization code is single-use");

// ---- Wrong password ----------------------------------------------------------
const wrong = await form("/oauth/authorize", {
  client_id: owner.reg.client_id, redirect_uri: REDIRECT, response_type: "code",
  code_challenge: "abc", code_challenge_method: "S256", step: "login", phone: "699000101", password: "nope", decision: "allow",
});
check(wrong.status === 200 && (await wrong.text()).includes("incorrect"), "wrong password shows an error, no redirect");

// ---- Restricted cashier ----------------------------------------------------
const cashier = await connect("699000102", "demo-cashier-2026");
const ctoken = cashier.tokens.access_token;
const cinfo = await tool(ctoken, "shop_info");
check(!cinfo.isError && cinfo.data.connectedAs.role === "cashier", "cashier connects (single shop, no picker)");
const csales = await tool(ctoken, "sales_summary");
check(csales.isError && /restricted/.test(csales.text), "restricted cashier cannot read sales_summary", csales.text);
const cstock = await tool(ctoken, "stock_levels");
check(!cstock.isError, "restricted cashier can still read stock_levels");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
