# StockFlow / PharmaStock: Project Handover

> Purpose: seed a **fresh chat scoped to this project only**. Read this first, then
> `CLAUDE.md` (deeper engineering context) and `README.md` (older, partly stale:
> predates the MAUI→Expo and Blazor→React pivots; trust CLAUDE.md + this file over it).
> **Last verified against the live system: 2026-10-11.** Everything is at **v0.2.2**
> (API + web deployed, desktop 0.2.2 installed, APK 0.2.2 on the tablet and the phone).
> The project memory (`~/.claude/projects/C--Dev-PharmaStock/memory/MEMORY.md`) holds the
> detailed decision records referenced below by `name`.

---

## 1. What this is

A **stock & sales management ecosystem** for a mini-pharmacy in Cameroon (with a light
maternity/services module), built generic enough to **resell to other small businesses**.
Low-connectivity context → **offline-first** is a hard requirement ("surtout pour l'Afrique"),
and the **Android tablet is the primary POS**, not the PC.

Names: product/installers **PharmaStock**, ecosystem/brand **StockFlow** (`@stockflow/core`,
logo, UI). Sponsor credited in every page footer: **mfSPACE.lu** (exact spelling).

Full spec: two Word docs at the repo root (`Specification_Book_Stock_Management_Ecosystem.docx`
EN, `Cahier_des_Charges_Ecosysteme_Gestion_Stock_FR.docx` FR).

---

## 2. Access map & platforms

A new Claude Code chat **on this machine** inherits the filesystem + SSH keys. Secret *values*
are NOT in this repo; they live in the server `.env`.

| Thing | Where / how |
|---|---|
| **Code repo** | `github.com/CeraphT/Stock-sales-Management` (private), branch `main`. Local: `C:\Dev\PharmaStock`. Working tree clean at handover (last commit `92bcf89`). |
| **Prod server** | Hetzner Ubuntu **`root@116.203.144.105`** (CX23, 2 vCPU / **4 GB** / 40 GB, 4 GB swap added). SSH key authorized from this machine. |
| **StockFlow on server** | `/root/apps/stockflow`, compose project **`deploy`** in `deploy/`: `deploy-api-1`, `deploy-web-1`, `deploy-caddy-1`, `deploy-db-1`, plus the `guide` container. **`deploy/Caddyfile`, `deploy/docker-compose.yml` and `deploy/guide.Caddyfile` hold LIVE uncommitted edits** (SMTP env, guide mounts): back them up before every `git pull` (see §6). |
| **Domains** (LWS DNS, `mfspace.lu`) | `api.mfspace.lu` API · `stock.mfspace.lu` web · `guide.mfspace.lu` user guides (HouseBudget at `/`, **StockFlow at `/stockflow/`**). TLS automatic (Caddy). |
| **Prod DB** | Postgres in `deploy-db-1`, db **`pharmastock`**, role **`stockflow`** (password in `deploy/.env`; use `$POSTGRES_USER` inside the container, there is no `postgres` role). Same container hosts `housebudget`. |
| **Backups** | Cron `/etc/cron.d/pg-backup` → `/root/bin/pg-backup.sh` daily 03:30 UTC (both DBs, `/root/backups`, 14 days, validated). PC pull task "PharmaStock - Pull prod DB backups" (daily 09:00) → `C:\Dev\prod-backups\`. E-mail alerts to infos@mfspace.lu on failure / stale backup. Run `pg-backup.sh` manually **before every deploy**. |
| **Prod secrets** | `/root/apps/stockflow/deploy/.env`: `POSTGRES_*`, `JWT_SECRET`, `BOOTSTRAP_SECRET`, `SMTP_PASS`. **Never commit or print these.** |
| **App super-admin (prod)** | "Foning", phone **`661595648`**, password user-set (**not known to Claude**). The same phone also has a **shop account "Steve Foning"** (2 CeraphT shops). If both have the same password, login asks *My shops* / *Super-admin console* (v0.2.2). |
| **App super-admin (dev)** | phone `600000000` / `super1234` (dev seed only). Claude does **not** create real accounts or set passwords. |
| **Test devices (adb)** | Samsung Tab S7 FE **SM-T733** `R52W606FF6A` (primary POS) · Xiaomi **M2101K9G** `5d23f540` (user's phone). Both accept plain `adb install -r` now (the package was sideloaded once). |
| **Local dev DB** | Postgres 17 service, db `pharmastock`, `postgres`/`postgres`. Also a **scratch DB `pharmastock_migtest`** (restored prod dump + fictional test accounts Awa/Paul): used to test migrations; can be dropped when no longer needed (user hasn't decided). |
| **Sibling app** | HouseBudget v2 (rental mgmt): `C:\Dev\HouseBudget`, server `/root/apps/housebudget-v2`, compose `housebudget`, `budget.mfspace.lu`. Shares the Postgres container and the guide site. |

---

## 3. Architecture

One backend, three clients, one shared TS core. Backend direction: **Api → Infrastructure → Domain**.

- **Backend**: ASP.NET Core 8 + EF Core 8 + PostgreSQL (`src/PharmaStock.*`). Endpoint groups in
  `Api/Services/*Endpoints.cs` (no `Endpoints/` folder). Migrations auto-apply on start.
  `dotnet-ef` pinned **8.0.10**.
- **Accounts model (new, 2026-10-06)**: one **account per phone** (`User`, phone globally unique
  except SuperAdmins) linked to shops through **`CompanyMembership`** (role Cashier/CompanyAdmin,
  `Restrict*` flags, status Active/Pending/Rejected/Disabled). A **shop-scoped JWT** carries the
  same claims as before (`company_id` + membership role), so business endpoints are unchanged.
  Endpoints: `/api/auth/register`, login (`accountOnly`, `preferShopAccount`),
  `/api/auth/select-company`, `/api/me/companies`, `/api/me/join`, join-requests approve/reject.
  Old app versions still work (legacy login opens a shop directly). See `project_multishop_accounts`.
- **Mobile**: `apps/mobile`, Expo/React Native (Expo Router, NativeWind, TanStack Query, Zustand,
  expo-sqlite + Drizzle). Primary POS. Full offline-first. Release builds use `https://api.mfspace.lu`,
  dev builds `http://localhost:5080` (needs `adb reverse tcp:5080 tcp:5080`).
- **Desktop**: `apps/desktop`, Tauri v2 + React (near-copy of the web screens), local SQLite,
  offline sales + outbox. Only raw ESC/POS over Rust transport is hardware-dependent.
- **Web**: `apps/web`, React + Vite. Local mirror for reads, but **the browser POS needs internet**
  to charge. Hosts the Super-Admin console.
- **Shared core**: `packages/core` (`@stockflow/core`): API client (GET retry, 20 s timeout,
  `NetworkError`), types, sync (push outbox → pull), keyed mobile i18n (`i18n/translations.ts`),
  receipts, printer, local services.
- **User guide**: `docs/user-guide/` (built HTML, see §6 and `reference_user_guide`).

---

## 4. Current status

Production is healthy and everything below is deployed / installed at v0.2.2.

**Built and live**
- **Login & My shops** (web, desktop, Android): phone + password with *Log in / Create an account*;
  "My shops" page (create/join forms 3 : shop list 1; on phones the list comes first); 3-step
  **creation wizard** (General / The shop / Equipment) over the *My business* fields, every step
  fits a tablet/laptop screen without scrolling; join by code = **request the manager approves**
  (role + restrictions) in Staff; branch picker remembered per shop; **safe shop switch**
  (pushes unsent work first, asks before erasing); last shop reopens even offline;
  super-admin/shop **chooser** after login.
- **My business** fully shared between wizard and settings (`components/companyForm/`), all FR/EN.
- **Catalog & stock**: packaging levels, FEFO batches, receive/adjust/return/count, bulk Excel
  import, labels, capabilities N1–N5 (weight, serial/IMEI, variants, assembly), alerts, forecast,
  dead stock, inventory report.
- **POS / cash register / history / refunds**, held sales, reward gift cards, B2B VAT-on-top.
- **Purchasing** (suppliers, POs with partial receive), **customers** (credit ≠ store credit),
  **gift cards**, **reports**, **tax declaration** (OHADA / generic VAT / none, journals).
- **Offline** A/B/C (local-first reads, outbox for stock ops + creates, cached server answers),
  reconciliation banner, daily local backups.
- **Support**: in-app tickets with screenshots on all apps, console triage (priority, SLA, assign,
  internal notes), e-mail to infos@mfspace.lu with **signed one-click actions**, reporter pop-ups
  + e-mail on reply/resolve. (`docs/support-process.md`, `project_support_feature`)
- **Super-admin**: console (web), company picker + impersonation on desktop & mobile, **company
  deactivation** (full block), devices/users/audit.
- **Excel export** next to every PDF report (web + desktop, real numbers).
- **Version footer** on every page: `StockFlow <Web|Desktop|Android> v0.2.2 · © mfSPACE.lu`
  (no commit hash on screen). (`feedback_version_footer`)
- **Branding**: teal box + amber arrow logo on all apps, installers (incl. NSIS icon) and launchers.
- **User guide** (FR/EN, illustrated, 21 sections): https://guide.mfspace.lu/stockflow/

**Open items / known gaps**
- **Desktop release**: code signing (SmartScreen warns) and auto-update are not done; ESC/POS
  thermal transport needs hardware testing. (`project_desktop_release_gaps`)
- **Web browser POS is online-only** (desktop/mobile sell offline). Documented in the guide.
- **Mobile**: logo upload missing (editable on web/desktop only); printer-settings and camera
  scanner strings are English only; some deep screens still have untranslated strings.
- **Scratch DB `pharmastock_migtest`**: delete when no longer needed (ask the user).
- Duplicate shop names in prod ("CeraphT" ×2 under Steve Foning): data, not a bug; user may rename.

---

## 5. Dev environment & how to run

- **API**: `cd src/PharmaStock.Api && dotnet run --urls http://localhost:5080` (`GET /health`).
  Against the scratch DB: `ConnectionStrings__Default="Host=localhost;Database=pharmastock_migtest;..."`
  on port 5091.
- **Web**: `npm run dev -w pharmastock-web` (:5174). Launch configs in `.claude/launch.json`:
  `web`, `desktop`, `api`, `web-testapi` (:5175 → API :5091), `desktop-testapi` (:5176),
  `web-prodpreview` (:5177), `guide` (:5178, open `/index.html`).
- **Desktop**: `cd apps/desktop && npm run tauri dev` (native) or `npm run dev` (browser).
- **Mobile**: native builds **only in the user's terminal** (Gradle loopback fails from Claude's
  tool): `cd C:\Dev\PharmaStock\apps\mobile\android; .\gradlew assembleRelease`.
- Type-check before shipping: `npx tsc --noEmit -p .` in `apps/web`, `apps/desktop`; `npx tsc --noEmit` in `apps/mobile`.
- Git Bash + adb: prefix with `MSYS_NO_PATHCONV=1` (path mangling). Use PowerShell for MSBuild paths.

---

## 6. Build & deploy (the safe procedure)

**Never `docker compose --build` on the 4 GB box** (it OOM-froze the server once). Build locally,
ship artifacts, wrap them in light images. (`reference_stockflow_web_deploy_oom`)

1. Backup: `ssh root@116.203.144.105 '/root/bin/pg-backup.sh >> /var/log/pg-backup.log 2>&1'`
2. Local: `dotnet publish src/PharmaStock.Api/PharmaStock.Api.csproj -c Release -o api-publish`
   and `VITE_API_BASE_URL=https://api.mfspace.lu npm run build -w pharmastock-web`.
3. `tar -czf deploy-artifacts.tgz api-publish -C apps/web dist nginx.conf` → scp to `/tmp`.
4. On the server in `/root/apps/stockflow`: copy `deploy/Caddyfile` and `deploy/docker-compose.yml`
   to `*.live.<ts>`, `git checkout --` them, `git pull`, restore the live copies; tag current
   images `deploy-api:pre-<tag>` / `deploy-web:pre-<tag>` (rollback); build images from
   `aspnet:8.0` + `COPY app/` and `nginx:alpine` + `COPY dist` + `nginx.conf`;
   `docker compose up -d --no-build api web`.
5. Verify `https://api.mfspace.lu/health`, `stock` and `budget` return 200, no errors in API logs.

**Versioning rule**: bump the version on **every** shipped build (web `apps/web/package.json`;
desktop `package.json` + `src-tauri/tauri.conf.json` + `Cargo.toml`; mobile `app.json` +
`android/app/build.gradle` versionName/versionCode, android/ is gitignored). Current: 0.2.2,
versionCode 4. Next change → 0.2.3.

**Desktop installer** (PowerShell; make sure no exe from `target/release` is running):
```powershell
cd C:\Dev\PharmaStock\apps\desktop
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; $env:VITE_API_BASE_URL = "https://api.mfspace.lu"
npm run tauri build
```
→ `src-tauri/target/release/bundle/nsis/PharmaStock_<ver>_x64-setup.exe` + `msi/`. Smoke-test the
exe (ProductVersion + window title), commit `Cargo.lock`.

**APK**: user runs `.\gradlew assembleRelease`; then **check the APK timestamp is newer than the
last commit** before `adb -s <serial> install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

**User guide**: edit `docs/user-guide/content.html` / `sec-*.html` → `node docs/user-guide/build.mjs`
(fails on any em dash) → commit + push → on the server `git pull` in `/root/apps/stockflow`
(same live-config dance). The `guide` container mounts `docs/user-guide` at `/srv-stockflow`
(a nested mount under the read-only `/srv` fails and took the site down once).

---

## 7. Key decisions & gotchas (don't undo)

- **Enums are integers on the wire**; client enums must match C# order.
- **Customer value model**: credit ≠ store credit; points hidden; reward gift cards. (`project_customer_value_model`)
- **Tax**: VAT-inclusive, rate 0 = off, SYSCOHADA 4431/4452/4441, accounting system configurable. (`project_tax_ohada`)
- **Customers** list/create only; **gift cards** standalone bearer cards.
- **No em dashes "—" in user-facing text** (looks AI-written). (`feedback_no_em_dashes`)
- **Blocked or failed action → popup**, not just a toast. (`feedback_blocked_popup`)
- **No commit hash on screen**; version + © mfSPACE.lu footer everywhere.
- **Super-admin impersonation flag**: guards must use `useInsideCompany()` (flag AND companyId);
  logout and every login reset it (a stale flag caused a blank /shops redirect loop, fixed v0.2.1).
- **Caching**: `index.html`/SPA routes and the guide site are served `Cache-Control: no-cache`
  (stale index pointing at deleted hashed assets = blank page).
- **Mobile footer & safe areas**: screens get their own `SafeAreaProvider` above the version
  footer, otherwise the bottom inset is applied twice.
- **EF + Npgsql DateTime** forced UTC globally; **drizzle on expo-sqlite**: no multi-statement
  `transaction()`; **Tauri** needs `sql:allow-execute` and `fs:allow-write-file` (Excel export).
- **NativeWind**: never `shadow-*`/box-shadow classes in the Expo app (release crash).
- **MailKit** for e-mail (System.Net.Mail silently fails on 587). Support e-mails are fire-and-forget.
- **Debug escalation**: at most 2 narrow fix attempts, then change approach. (`feedback_debug_escalation`)

---

## 8. What was done in this chat (2026-10-04 → 2026-10-11)

1. **Brand**: new logo + teal theme on all apps; installer/launcher icons (NSIS icon, Windows icon cache).
2. **Server health**: swap, build-cache prune, HouseBudget backup bloat fix, daily pg_dump + PC pull
   + e-mail alerts.
3. **Mobile fixes**: dashboard skeleton, session restore, company picker for super-admin (M8),
   greyed features without company, loading states, flaky-DNS retries.
4. **Super-admin**: company deactivation (full block), picker on desktop.
5. **Offline A/B/C** and offline sales history.
6. **Support system** end to end (tickets, console, e-mail actions, reporter notifications).
7. **Copy**: removed all em dashes from UI text.
8. **Excel export** (web + desktop).
9. **Accounts & My shops** redesign (server migration merged duplicate prod accounts; 34-check
   e2e harness in the scratch DB), creation wizard, join approvals, Staff by phone,
   tablet layout iterations (forms 3 : list 1, no-scroll steps), mobile My business/Staff in FR.
10. **Version footer** + aligned versions (0.2.0 → 0.2.2), cache fixes, blank-page loop fix,
    super-admin/shop chooser.
11. **User guide** at guide.mfspace.lu/stockflow with a HouseBudget | StockFlow switcher.

Desktop builds shipped: 0.1.1 → 0.2.2. APKs installed on the tablet and the user's phone.

---

## 9. Starting a new chat

Open Claude Code in `C:\Dev\PharmaStock` (auto-loads `CLAUDE.md`), point it at this file.
Safety rules that still apply: Claude does not create real accounts or set passwords; production
secrets stay in the server `.env`; confirm before destructive or outward-facing actions (deploys,
deletes, messages); keep the server's live config files when pulling.
