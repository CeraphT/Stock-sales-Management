# StockFlow / PharmaStock — Project Handover

> Purpose: seed a **fresh chat scoped to this project only**. Read this first, then
> `CLAUDE.md` (deeper engineering context) and `README.md` (older, partly stale —
> predates the MAUI→Expo and Blazor→React pivots; trust CLAUDE.md + this file over it).
> Last verified against the live system: **2026-10-05** (prod healthy).

---

## 1. What this is

A **stock & sales management ecosystem** for a mini-pharmacy in Cameroon (with a
light maternity/services module), built generic enough to **resell to other small
businesses**. Low-connectivity context → **offline-first** is a first-class
requirement, and the **Android tablet is the primary POS**, not the PC.

Product name in UI/installers: **PharmaStock**. Shared package / ecosystem name:
**StockFlow** (`@stockflow/core`). Same thing.

Full spec: two Word docs at the repo root —
`Specification_Book_Stock_Management_Ecosystem.docx` (EN) and
`Cahier_des_Charges_Ecosysteme_Gestion_Stock_FR.docx` (FR). The code is built
section-by-section against them.

---

## 2. Access map & platforms (how to get "full access")

A new Claude Code chat **on this machine** inherits the same filesystem + SSH keys
this session used, so it already has the access below. Secret *values* are deliberately
NOT written in this repo — they live on the server's `.env`; retrieve them there.

| Thing | Where / how |
|---|---|
| **Code repo** | `github.com/CeraphT/Stock-sales-Management` (private), branch `main`. Local: `C:\Dev\PharmaStock`. |
| **Prod server** | Hetzner Ubuntu box **`root@116.203.144.105`** (CX23, 2 vCPU / 4 GB / 40 GB). SSH key already authorized from this machine. |
| **StockFlow on server** | `/root/apps/stockflow` — deploy from `/root/apps/stockflow/deploy` (compose project **`deploy`** → containers `deploy-api-1`, `deploy-web-1`, `deploy-caddy-1`, `deploy-db-1`). |
| **Domains** (LWS DNS for `mfspace.lu`, A → server IP) | `api.mfspace.lu` → .NET API · `stock.mfspace.lu` → web client. TLS is automatic (Caddy + Let's Encrypt). |
| **Prod DB** | Postgres in `deploy-db-1`, database **`pharmastock`**, role **`stockflow`** (password in `deploy/.env`). Same container also hosts the `housebudget` DB (sibling app). |
| **Prod secrets** | `/root/apps/stockflow/deploy/.env` on the server: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `BOOTSTRAP_SECRET` (+ `HB_*` for the sibling app). **Never commit these.** Generate with `openssl rand -base64 48`. |
| **App super-admin (dev)** | phone **`600000000`** / password **`super1234`** (dev-seeded). |
| **App super-admin (prod)** | "Foning", phone **`661595648`** — password is user-set, **not known to Claude**. New super-admins are bootstrapped via `POST /api/superadmin/bootstrap` (header `X-Bootstrap-Secret: <BOOTSTRAP_SECRET>`) or the console → Administrators tab. **Claude does not create accounts or set passwords** — the user does. |
| **Local dev DB** | Postgres service `postgresql-x64-17`, db `pharmastock`, `postgres`/`postgres` (see `appsettings.json`). |
| **Sibling app** | HouseBudget v2 (rental mgmt) — separate repo `CeraphT/HouseBudget-v2` at `/root/apps/housebudget-v2`, own compose project `housebudget` (`hb-api`, `hb-web`), domains `budget`/`budgetapi.mfspace.lu`. Shares the same Postgres container. It's the **source of the "ideas to port" in §8**. |

---

## 3. Architecture

One backend, three clients, one shared TS core. Dependency direction on the backend
is strict: **Api → Infrastructure → Domain**, never reversed.

- **Backend** — ASP.NET Core Web API (.NET 8) + EF Core 8 + PostgreSQL.
  `src/PharmaStock.Api` (`Services/` = endpoint groups + plain services, **no `Endpoints/` folder**),
  `src/PharmaStock.Infrastructure` (DbContext, `Data/Configurations`, `Data/Migrations`,
  `Services/` shared logic like `StockDeductionService`),
  `src/PharmaStock.Domain` (POCO entities, one class/enum per file).
  `AUTO_MIGRATE=true` applies EF migrations on API start. `dotnet-ef` pinned **8.0.10**.
- **Mobile** — `apps/mobile` — **Expo / React Native** (Expo Router, NativeWind,
  TanStack Query, Zustand, expo-sqlite + Drizzle). **Primary POS target (Android tablet).**
  Full offline-first (local SQLite mirror + push/pull sync).
- **Desktop** — `apps/desktop` — **Tauri v2 + React + TS + Tailwind**, wraps the web build.
  Dual-driver local SQLite (tauri-plugin-sql natively; sql.js in a plain browser for dev).
  Full bidirectional sync. Only raw ESC/POS thermal transport is unbuilt (hardware-dependent).
- **Web** — `apps/web` — **React + Vite + TS + Tailwind**, **online-first** (no offline layer),
  consumes `@stockflow/core`. Hosts the **Super-Admin console** (fleet, impersonation).
- **Shared core** — `packages/core` (`@stockflow/core`) — api client, types, sync, receipt,
  printer, business logic shared across mobile/desktop/web.
- **Legacy, deleted** — the old .NET MAUI client (Windows+Android) and the Blazor
  SuperAdmin web were removed; recoverable from git history. Don't revive them.

---

## 4. Current status (what's built)

Backend is solid and in production. From recent history (`git log`), the clients now cover:

- **Onboarding/auth** — create company (+ first admin, returns JWT), join by code,
  phone+password login, refresh tokens, staff roster/activate/password-reset.
- **Catalog & stock** — products with packaging hierarchy (box/blister/unit),
  categories, stock receive (new Batch + cost), manual adjust (reasoned, no-negative),
  batch/movement history, stock availability check (Section 17).
- **POS / sales** — FEFO deduction via `StockMovement`, packaging-aware pricing,
  mixed product+service lines, split payments, Credit sales, barcode scanning,
  hold/resume sales, refunds; **two-pane POS on tablet**.
- **Multi-branch** (Section 16.6) — `Batch`/`Sale`/`StockMovement` carry `LocationId`;
  FEFO scoped per location.
- **Tax** — per-product VAT snapshot at sale time; configurable accounting system
  (OHADA / GenericVAT / None) — see §7.
- **Customers/loyalty** — customers (list/create only, keep financial history),
  credit balance **and** store credit (distinct), hidden loyalty points, reward gift cards.
- **Suppliers, Purchase Orders** (partial receiving → real Batch + movement, IMEI capture),
  **Gift Cards**, **Reports** (date-range sales, top products), **Services module** (Section 20).
- **Inventory capabilities N1–N5** — adaptive per business type: weight/measure selling,
  serial/IMEI tracking, product variants (size/colour), assembly/kits (BOM, build-to-stock),
  plus supplier returns, cycle count, barcode labels, reorder-aware alerts, demand forecast,
  dead-stock. (See `project_inventory_capabilities` memory for per-client status + what's deferred.)
- **Super-admin** (web only) — overview, companies, devices & sessions, users, audit log,
  administrators, **impersonation**, fleet presence/geo, device block/wipe.
- **Printing** — PDF/HTML receipts; ESC/POS layer exists (mobile has a native Kotlin module);
  raw thermal transport is the one hardware-dependent gap.

**Known open items / gaps**
- **Desktop release readiness** (not features): auto-update + code signing (SmartScreen warns),
  visible sync status (last-synced / N pending / offline), on-device verification of a real
  sale + ESC/POS print + full offline↔online cycle from the *installed* app. See
  `project_desktop_release_gaps` memory.
- **Mobile API base** — the Expo app still defaults to `http://localhost:5080` (needs
  `adb reverse`). To ship an APK that works off the PC, point it at `https://api.mfspace.lu`
  (HouseBudget's mobile already does this via a `PROD_API` constant — copy that pattern).
- Super-admin mode on mobile/desktop (company-picker/impersonate) — pending **M8**.

---

## 5. Dev environment & how to run

- **PostgreSQL 17** local (`postgres`/`postgres`, db `pharmastock`).
- **.NET SDK** installed; net8.0 runtimes present. `dotnet-ef` **must stay 8.0.10**.
- **API**: `cd src/PharmaStock.Api && dotnet run --urls http://localhost:5080` → `GET /health`.
- **Web**: `cd apps/web && npm run dev` → http://localhost:5174 (API on :5080).
- **Desktop**: `cd apps/desktop && npm run tauri dev` (native) or `npm run dev` (browser :5173).
- **Mobile**: Metro `cd apps/mobile && npx expo start`; native build via `npx expo run:android`
  (run in the **user's own terminal** — it binds a loopback that fails from Claude's tool).
- Android device: `adb reverse tcp:5080 tcp:5080` after each USB reconnect (lost on reboot).

---

## 6. Build & deploy

**Prod (web + API) — one box, Docker + Caddy:**
```bash
ssh root@116.203.144.105 'cd /root/apps/stockflow && git pull && cd deploy && docker compose up -d --build'
```
Rebuild just one service: append `api` or `web` (e.g. `... up -d --build api web`).
Watch startup + auto-migrations: `ssh root@116.203.144.105 'docker compose -f /root/apps/stockflow/deploy/docker-compose.yml logs -f api'`.
Verify: `curl https://api.mfspace.lu/health` → `{"status":"ok",...}`, `https://stock.mfspace.lu` → 200.

**Desktop installer (Windows, PowerShell):** close the running app first (it locks the exe).
```powershell
cd C:\Dev\PharmaStock\apps\desktop
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"   # cargo not on default PATH
$env:VITE_API_BASE_URL = "https://api.mfspace.lu"
npm run tauri build
```
Output: `src-tauri/target/release/bundle/nsis/PharmaStock_<ver>_x64-setup.exe` (+ `/msi/...msi`).

**Mobile APK (user's own terminal):**
```bash
cd C:\Dev\PharmaStock\apps\mobile\android; .\gradlew assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```
Signature conflict on install → `adb uninstall com.pharmastock.app` then reinstall.
MIUI/Xiaomi test devices block adb installs — see the manual-sideload workaround in `CLAUDE.md`.

---

## 7. Key product decisions & gotchas (don't undo these)

- **Enums serialize as integers** over the wire (no `JsonStringEnumConverter` registered).
  Client enums must match the C# declaration order exactly (`apps/mobile/src/lib/api/enums.ts`).
- **Customer value model**: credit ≠ store credit (keep both); loyalty points hidden;
  rewards issued as gift cards; HID-only scanner. (`project_customer_value_model`)
- **Tax & OHADA**: VAT-inclusive; rate 0 = off (no `taxEnabled` column); OHADA TVA
  declaration with SYSCOHADA accounts 4431/4452/4441; accounting system configurable
  (OHADA / GenericVAT / None). (`project_tax_ohada`)
- **Customers** are list/create-only (preserve financial history); no update/delete/get-by-id.
  **Gift cards** are standalone bearer instruments (`GC-XXXXXXXX`), no `CustomerId`.
- **EF + Npgsql + DateTime**: all `DateTime` coerced to UTC via a global ValueConverter in
  the DbContext — don't special-case per endpoint.
- **drizzle-orm on expo-sqlite**: `db.transaction()` silently drops multi-statement upserts —
  issue each statement top-level. (`reference_drizzle_sqlite_proxy_findfirst_phantom`,
  and the transaction note in `CLAUDE.md`.)
- **Tauri `sql:allow-execute`**: desktop local-DB writes silently no-op without the
  capability + `$N` placeholders. (`reference_tauri_sql_execute_permission`)
- **NativeWind**: never use `box-shadow`/`shadow-*` classes in the Expo app — crashes the
  **release** bundle (react-native-css-interop). Use native RN `shadow*`/`elevation` style props.
  (`reference_nativewind_boxshadow_release_crash`)
- **Native Android builds** fail from Claude's tool (Gradle loopback) — run in the user's
  terminal. (`reference_android_build_loopback`)
- **Debug escalation**: cap narrow same-shaped fix attempts at 2, then change approach.
  (`feedback_debug_escalation`)

---

## 8. Ideas from HouseBudget worth porting into StockFlow

HouseBudget was **forked from StockFlow's architecture**, so patterns transfer cleanly
(same `core`/web/desktop/mobile layering, same offline outbox, same EF shared DbContext).
Recent HouseBudget work that would benefit StockFlow:

1. **MailKit for all email** — HouseBudget replaced the legacy `System.Net.Mail.SmtpClient`
   (which over STARTTLS on 587 *completes without throwing yet never delivers*) with MailKit
   (StartTls on 587 / SslOnConnect on 465, 30 s timeout, real errors). If StockFlow emails
   receipts/reports/alerts, use MailKit the same way. (`reference_hb_email_mailkit`)
2. **Fire-and-forget email** on hot paths — don't make a sale/checkout/sign response wait on
   SMTP; persist first, send the email on a background task so the client never blocks.
3. **Client request timeout** — HouseBudget added a 45 s `AbortController` timeout to the
   shared fetch so a stalled request surfaces as "offline" (queued to the outbox) instead of
   freezing on a spinner forever. StockFlow's `@stockflow/core` fetch should do the same.
4. **On-device build tag** — a tiny visible `build YYYY-MM-DDx` label (bumped each release)
   on a first screen, so you can instantly confirm *which* build is actually installed. Hugely
   useful given the silent-failed-`adb install` problem on MIUI devices.
5. **Document / action trail** — a chronological "journal" consolidating every document
   generated / emailed / downloaded / signed + lifecycle events, each re-downloadable. Maps
   to a StockFlow **receipt/invoice/PO trail** per sale/customer/supplier.
6. **PDF generation with QuestPDF** incl. per-page content (HouseBudget stamps a signature on
   every page). StockFlow invoices/PO PDFs can reuse this.
7. **Step wizard forms** (Next/Back, "Create" only on the last step, Enter advances instead of
   submitting) for onboarding / product / company creation.
8. **Icon-only action buttons** with tooltip on hover (web) / long-press (mobile).
9. **Prerequisite gating** — block a step until its prerequisites are met, with a clear
   checklist of what's missing (HouseBudget gates rent entry on deposit + move-in).
10. **Richer select labels** — show the distinguishing attribute (type/size), not just a name
    or price, in pickers.
11. **Logo → home** navigation + a real **favicon/brand mark** on web.

Cross-pollination goes both ways: StockFlow's FEFO, multi-branch, offline sync protocol,
and super-admin fleet console are the mature originals HouseBudget borrowed.

---

## 9. Starting the new chat

Open a Claude Code chat in `C:\Dev\PharmaStock`. It auto-loads `CLAUDE.md`. Point it at this
`HANDOVER.md` for status + access + the HouseBudget idea list. The project's own memory
(`~/.claude/projects/C--Dev-PharmaStock/memory/`, indexed by `MEMORY.md`) carries the
detailed decision records referenced above and persists across chats.

**Safety reminders that still apply:** Claude does not create accounts or set passwords;
production secret *values* stay in the server `.env` and must never be committed; confirm
before destructive/outward-facing actions.
