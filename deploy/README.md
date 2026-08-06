# Deploying StockFlow to the Hetzner server (mfspace.lu)

One Ubuntu box (`116.203.144.105`, CX23 · 2 vCPU · 4 GB · 40 GB) runs the whole
stack in Docker, fronted by Caddy with automatic HTTPS:

| Subdomain | Serves |
|---|---|
| `api.mfspace.lu` | StockFlow API (.NET) + Postgres |
| `stock.mfspace.lu` | StockFlow web client |
| `budget.mfspace.lu` | HouseBudget (Phase B) |

> These files are a first-run stack. Docker builds can't be verified from the dev
> machine, so expect to iterate the first time on the server. Nothing here runs
> anywhere until **you** execute the steps below.

---

## 1. DNS (LWS panel — do this first, it takes time to propagate)
In the LWS DNS zone for `mfspace.lu`, add **A records** all pointing at the server:

```
api     A   116.203.144.105
stock   A   116.203.144.105
budget  A   116.203.144.105
```
(Optionally an `AAAA` record to the server's IPv6 `2a01:4f8:1c19:103d::/64` too.)
Check with `dig api.mfspace.lu +short` — it must return the server IP before Caddy
can get certificates.

## 2. Hetzner firewall
Allow inbound **22 (SSH), 80 (HTTP), 443 (HTTPS)**. Caddy needs 80+443 open to the
internet to issue and renew Let's Encrypt certs.

## 3. Prepare the server (once)
SSH in and install Docker + the Compose plugin:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in after this
docker compose version          # confirm the plugin is present
```

## 4. Get the code onto the server
The repo is private, so either:
- **Clone with a GitHub deploy key / token**:
  `git clone https://<TOKEN>@github.com/CeraphT/Stock-sales-Management.git stockflow`
- or `scp`/rsync the working tree up.

## 5. Configure secrets
```bash
cd stockflow/deploy
cp .env.example .env
nano .env            # set strong POSTGRES_PASSWORD, JWT_SECRET, BOOTSTRAP_SECRET
```
Generate values with `openssl rand -base64 48`.

## 6. Launch
```bash
docker compose up -d --build
docker compose logs -f api      # watch it start + auto-run EF migrations (AUTO_MIGRATE=true)
```
First `--build` is slow (compiles the .NET API and the Vite web). Caddy grabs TLS
certs automatically once DNS resolves.

Verify:
- `curl https://api.mfspace.lu/health` → `{"status":"ok",...}`
- open `https://stock.mfspace.lu` → the login screen.

## 7. Create the super admin (once)
```bash
curl -s -X POST https://api.mfspace.lu/api/superadmin/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: <BOOTSTRAP_SECRET from .env>" \
  -d '{"name":"Foning","phone":"661595648","password":"<your password>","email":"foningsteve11@gmail.com"}'
```
(If a super admin already exists this returns a conflict — expected.)

## 8. Point the clients at the hosted API
- **Web**: already built with `VITE_API_BASE_URL=https://api.mfspace.lu` (baked in the image).
- **Desktop**: set `VITE_API_BASE_URL=https://api.mfspace.lu` at build.
- **Mobile (Expo)**: currently defaults to `http://localhost:5080`. To ship an APK
  that works off the PC, configure the base URL to `https://api.mfspace.lu`
  (via `configureApi` at startup / an env) and rebuild. **This finally removes the
  `adb reverse` / PC dependency.** (Small mobile change — ask and I'll wire it.)

## 9. Updating later
```bash
cd stockflow && git pull
cd deploy && docker compose up -d --build
```
Migrations re-run automatically on API start.

## Backups
- Postgres data lives in the `pgdata` Docker volume. Add a nightly
  `docker compose exec db pg_dump ...` to a Hetzner Storage Box, or enable Hetzner
  server Backups (the console's "Backups" tab).

---

## Phase B — HouseBudget (added after StockFlow is live)
HouseBudget (C#) gets its own image + a `budget.mfspace.lu` block in the Caddyfile,
plus a PWA manifest/service worker so it installs on phones. Its service + DB volume
are appended to this same `docker-compose.yml`.
