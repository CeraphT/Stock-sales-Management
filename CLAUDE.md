# PharmaStock — Project Context for Claude Code

Stock & sales management ecosystem for a mini-pharmacy in Cameroon (with
light maternity/services module), designed to eventually be resold to other
small businesses. Full spec lives in two Word docs (English/French, ~40
pages each) — ask the user to share them if you need detail on a feature
not yet covered here (loyalty points, installment plans, Super Admin
dashboard, etc.).

**Read `README.md` next** — it has the architecture rationale and endpoint
list. This file is session/handoff context; README is the living project doc.

## ⚠️ Critical: repo location

This repo lives at **`C:\Dev\PharmaStock`** — a plain local folder, deliberately
**outside OneDrive**. Do not move it back into any OneDrive/Dropbox/cloud-sync
folder. A prior session had the repo under `C:\Users\keubo\OneDrive\Documents\`
and a heavy Android build (rapid create/delete of thousands of small `.class`
files under `obj\...\android\bin\classes\`) raced with OneDrive's sync engine,
corrupting local placeholder metadata badly enough that `.git` appeared to lose
its own `HEAD`/`config`/`index` files. No data was actually lost — the cloud
copy and OneDrive's recycle bin both had everything, and a full recovery
(verified file-for-file, all commits intact) is what put the repo at its
current path — but recovering took a long, careful, multi-step process. Keep
it out of any sync folder.

## Stack & architecture

- **Backend**: ASP.NET Core Web API (.NET 8) + EF Core + PostgreSQL — `src/PharmaStock.Api`, `.Domain`, `.Infrastructure`. Unchanged by the client rewrite below.
- **Client — Android**: `apps/mobile/` — Expo/React Native (Expo Router, NativeWind, TanStack Query, Zustand, expo-sqlite+Drizzle). All 8 phases built. See "Client rewrite: MAUI → Expo/React Native" below.
- **Client — Desktop**: **being rebuilt in Tauri + React** (chosen 2026-08-03 for a better desktop UI than MAUI). Not scaffolded yet — the full rebuild guide (backend API, reusable `@stockflow/core`, MAUI UX/design reference, phased plan) is **[`docs/desktop-rebuild.md`](docs/desktop-rebuild.md)**. Target location `apps/desktop/`.
- **Client — legacy MAUI: DELETED** (2026-08-03). Was `src/PharmaStock.Desktop` (multi-targeted Windows + Android, ~34 screens). Recoverable from git history if ever needed; everything it did is captured in `docs/desktop-rebuild.md`.
- **Web (Blazor)**: `src/PharmaStock.Web` — a real SuperAdmin web app exists (companies/admins/company-detail/login pages, `SuperAdminApiClient`), contrary to older "not started" notes. Not the main client layer; left as-is.

Dependency direction on the backend: `Api → Infrastructure → Domain`, never
reversed.

## Client rewrite: MAUI → Expo/React Native (apps/mobile/)

Mid-project, the user asked to integrate expo.dev's visual design and then,
after discussion of the tradeoffs, explicitly chose a **full rewrite** of the
client to Expo/React Native over continuing to restyle MAUI. This is a
deliberate, confirmed decision — not an experiment. Full plan (architecture
decisions, 8-phase build order, verification strategy) is preserved in the
plan file the session generated; ask the user if you need the complete
phase-by-phase breakdown, or re-derive it from `apps/mobile/`'s current state.

Key decisions:
- **Android only for now** — no Windows target in the new stack; MAUI Desktop
  keeps serving Windows users until this is revisited.
- **Full offline-first sync from the start** (not deferred) — local SQLite +
  Drizzle, porting the exact push/pull protocol (FEFO deduction, idempotent
  push, shift-conflict auto-close, server-side money-field re-derivation)
  already implemented in the MAUI client's `SyncService`/`LocalSalesService`/
  `LocalShiftService`/`LocalCatalogQueryService`.
- **MAUI has since been DELETED** (2026-08-03) — the user opted to rebuild the
  desktop client in Tauri + React instead of keeping MAUI. See
  `docs/desktop-rebuild.md`. (This bullet is kept for historical context on the
  original plan.)
- Business-generic copy/branding throughout (not pharmacy-specific wording),
  consistent with the resale-to-other-businesses positioning.

Current status: **All 8 phases built** (including Phase 8 — Printing; older
notes calling it "not started" are stale — see "Immediate next steps" for the
real state and what's left, which is on-device verification, not
construction). Phase 1 — Expo Router set up, NativeWind theme ported
from MAUI's `Colors.xaml`, full TS API client (types for every endpoint),
auth screens (Login/Create Company/Join Company) working end-to-end against
the real API on-device, verified via a local native dev client (not Expo
Go — see gotcha below). Phase 2 — expo-sqlite + Drizzle ORM local DB
(`src/lib/db/`), a read-only Product Catalog screen reactively driven by
the local DB via `useLiveQuery`. Phase 3 — full local schema (17 tables
mirroring `PharmaStockDbContext`, `src/lib/db/schema.ts`); full sync pull
(`src/lib/sync/syncPull.ts`, correct dependency order, since-reset
self-heal) and push (`src/lib/sync/syncPush.ts`, idempotent) wired by a
push-then-pull orchestrator (`src/lib/sync/syncNow.ts`); `localDbWriteLock`;
FEFO stock deduction (`src/lib/local/stockDeduction.ts`); the three
local-first service modules ported from the MAUI client —
`localSalesService`, `localShiftService`, `localCatalogQueryService` under
`src/lib/local/`. Phase 4 — Dashboard (stat tiles + SVG revenue-trend/
stock-health charts, `src/components/RevenueTrendChart.tsx`/
`StockHealthDonut.tsx`), POS/Cart with barcode scanning
(`src/app/(app)/scanner.tsx`, `expo-camera`) and manual search, checkout
across all payment methods, hold/resume sales (with a stock-shortfall
warning on resume — `held-sales.tsx`). Phase 5 — full Product Catalog CRUD
(add/edit/archive/restore), Categories, Stock Receive/Adjust with a real
date picker (`src/components/DateField.tsx`), a custom in-app Alert system
(`src/lib/ui/alertStore.ts` + `AppAlertHost.tsx`, replacing RN's
`Alert.alert` which rendered dark/broken on-device) used everywhere.
Phase 6 — Sales History (paginated, infinite scroll) + Sale Detail, a
grouped/collapsible custom drawer sidebar mirroring MAUI's flyout
structure (`(drawer)/_layout.tsx`). Then, per explicit request: currency
formatting everywhere an amount is shown (`formatCurrency` +
`useCompanyCurrency`/`useCompanyInfo` hooks, reading the company's own
`currency` field reactively from the local DB) and a full PDF receipt
system (`src/lib/receipt/` — `generateReceiptHtml.ts` template,
`receiptActions.ts` using `expo-print`/`expo-sharing` for view/print/
share), wired into checkout's post-sale success alert and into Sale
Detail. **Phase 7** — Suppliers CRUD, Customers CRUD + detail (credit
balance, loyalty points, redeem-to-store-credit), Gift Cards (issue/list/
toggle active), Purchase Orders (create with a product-line builder,
per-line partial receiving that creates a real Batch+StockMovement,
cancel-while-Pending-only), Reports (date-range sales summary + top
products), and a "My business" company-settings screen (name/currency/tax
rate/loyalty rates, read-only join code, branch list). All the drawer's
"coming soon" stub items now route to real screens except Printer (Phase
8). Verified on-device throughout: a full sync pull's row counts matched
Postgres exactly across every table after a fresh app-data clear, and
every phase was type-checked (`npx tsc --noEmit` clean) before each native
rebuild.

### Folder convention (apply to all new files)

Every project uses a strict one-type-per-file, layer-by-folder layout —
**no bundling several classes into one file**, and **no `Endpoints/` folder**
in Api (endpoint-mapping classes live in `Services/` alongside plain
business-logic services, e.g. `JwtTokenService.cs`):

```
PharmaStock.Domain/Models/        one class or enum per file (Company.cs, UserRole.cs, ...)
PharmaStock.Infrastructure/Data/  DbContext, Configurations/, Migrations/
PharmaStock.Infrastructure/Services/  shared business logic (StockDeductionService)
PharmaStock.Api/Services/         endpoint groups (CompanyEndpoints.cs, SaleEndpoints.cs, ...) + JwtTokenService.cs
PharmaStock.Desktop/Views/         one MAUI page + code-behind per screen
PharmaStock.Desktop/Controls/      reusable ContentViews (FormField.xaml)
PharmaStock.Desktop/Services/      PharmaStockApiClient, SessionService
```

## Priority: Android is primary, not Desktop

Per explicit instruction: shop staff mostly have an Android tablet, not a PC
(power-outage resilience, cheaper/more repairable hardware in Cameroon). The
Android build is the primary POS target; Windows Desktop is secondary/
optional for businesses that already own a PC. **Same MAUI project, same
codebase** — this is a priority/UI-scope decision, not a separate app.
Concretely: Mobile must carry the *full* POS workflow (Section 3.1 — barcode
scan, cart, payment, receipt, stock deduction), not a lighter lookup-only
scope, and the UI should adapt to `DeviceInfo.Current.Idiom` (tablet = fuller
multi-column layout; phone = simplified single-column). iOS is **not**
targeted yet — needs a Mac or cloud Mac CI runner, which isn't set up; don't
generate/build for iOS until the user says that's ready.

## Current status

### Backend (API) — solid, tested
- Company onboarding (create company + first admin + default Location in
  one transaction, returns JWT), join-by-code, login (phone+password, JWT)
- Product catalog with packaging hierarchy (box/blister/unit), stock
  availability check (Section 17)
- **Sales endpoint** (the important one): FEFO stock deduction via
  `StockMovement` rows (never a bare balance), packaging-aware pricing,
  mixed product+service lines, split payments, Credit sales against
  `Customer.CreditBalance`, per-product tax rate snapshot
- Stock movement endpoints: receiving (creates a new `Batch` + cost),
  manual adjustment (mandatory reason, can't go negative), batch/movement
  history views
- **Location** (multi-branch, Section 16.6): every company gets a default
  "Main" location; `Batch`/`Sale`/`StockMovement` all carry `LocationId`;
  FEFO deduction is scoped per-location (verified: a sale at a branch with
  no local stock correctly 409s even if another branch has stock)
- Confirmed built (contrary to earlier notes in this file): refresh tokens
  (`POST /api/auth/refresh`, rotates on every use), Suppliers/Customers/
  GiftCards/Loyalty-redeem/PurchaseOrders/Reports endpoints all exist and
  match what the Expo client's Phase 7 screens consume — see
  `SupplierEndpoints.cs`, `CustomerEndpoints.cs`, `GiftCardEndpoints.cs`,
  `LoyaltyEndpoints.cs`, `PurchaseOrderEndpoints.cs`,
  `ReportingEndpoints.cs` in `PharmaStock.Api/Services/`. Note: no
  `JsonStringEnumConverter` is registered anywhere in the API, so every
  C# enum (`PurchaseOrderStatus`, `PaymentMethod`, `DevicePlatform`, etc.)
  serializes as a raw integer over the wire, not a string — client-side
  enums must match the C# declaration order exactly (see
  `apps/mobile/src/lib/api/enums.ts`).
- Customers are intentionally **list/create only** — no update or delete
  endpoint, since a customer accumulates real financial history
  (`CreditBalance`, `LoyaltyAccount`) that must never be silently
  discarded. There's also no get-by-id; fetch the list and filter
  client-side for a single customer's detail view.
- Gift cards are **standalone**, not nested under a customer — no
  `CustomerId` FK on `GiftCard` at all, they're anonymous bearer
  instruments identified by an auto-generated `Code` (format
  `GC-XXXXXXXX`).

### Client (legacy MAUI) — DELETED 2026-08-03
The .NET MAUI client (`src/PharmaStock.Desktop`) has been removed from the repo
and the solution. It had grown to a near-complete cross-platform (Windows +
Android) POS — ~34 screens, full offline sync, ESC/POS printing — far beyond
the "onboarding only" this section used to claim. The user chose to rebuild the
**desktop** client in Tauri + React for a better UI; Android is served by
`apps/mobile` (Expo). Its entire feature set, UX, and design system are
preserved in **`docs/desktop-rebuild.md`**, and the code is recoverable from git
history (last present just before the deletion commit).

## Dev environment (this machine)

*Note: this machine was rebuilt/replaced partway through the project — the
tooling below was reinstalled from scratch on 2026-07-28 and paths differ
slightly from earlier session notes (e.g. JDK is no longer at
`C:\microsoft-jdk`). If you're on yet another machine and something here
doesn't match reality, trust the machine over this file and update it.*

- **PostgreSQL 17** running as a Windows service (`postgresql-x64-17`), db
  `pharmastock`, `postgres`/`postgres` dev credentials (see `appsettings.json`)
- **.NET SDK 10.0.110** installed. Domain/Infrastructure/Api target `net8.0`
  — this builds fine with only the SDK, but *running* them (or `dotnet ef`)
  needs the actual net8.0 runtimes installed separately, which they now are:
  `Microsoft.NETCore.App 8.0.29` + `Microsoft.AspNetCore.App 8.0.29`
  (installed via winget `Microsoft.DotNet.Runtime.8` /
  `Microsoft.DotNet.AspNetCore.8`), alongside the SDK's own 10.0.10 runtimes.
  Desktop/Mobile targets `net10.0-android` + `net10.0-windows10.0.19041.0`
- **`dotnet-ef` global tool must stay pinned to `8.0.10`** (matching
  `Microsoft.EntityFrameworkCore` in `Infrastructure.csproj`), not the
  default `dotnet tool install -g dotnet-ef` (which grabs 10.x). A version
  mismatch throws a confusing `System.Runtime, Version=10.0.0.0` FileNotFound
  at runtime, not an obvious version-mismatch error. Reinstall with
  `dotnet tool install -g dotnet-ef --version 8.0.10` if this ever regresses.
- **MAUI workloads installed**: `maui-windows`, `maui-android` (not `maui-ios`
  — don't install/target iOS without the user's explicit go-ahead)
- **Android SDK**: `C:\android-sdk` (set `$env:ANDROID_HOME`) — cmdline-tools
  plus `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`. The
  MAUI Android workload (`Microsoft.Android.Sdk.Windows` 36.1.69) needs API
  level **36** specifically — API 35 alone isn't enough and fails with
  `XA5207: Could not find android.jar for API level 36`.
- **JDK**: Microsoft Build of OpenJDK 17, installed via winget to
  `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot` (set `$env:JAVA_HOME`)
- `ANDROID_HOME` and `JAVA_HOME` are now persisted as **user-level** env vars
  (`[Environment]::SetEnvironmentVariable(..., "User")`), so new terminals
  pick them up automatically — no more per-session re-set needed. (New
  PowerShell/Bash sessions started *before* this change won't see them
  without a restart.)
- Physical Android device connects via USB; after each reconnect, redo:
  `& "C:\android-sdk\platform-tools\adb.exe" reverse tcp:5080 tcp:5080` (this
  reverse rule is lost on every USB reconnect/reboot — if the app suddenly
  can't reach the API after working fine before, re-check `adb reverse --list`
  before anything else).
- To run the API: `cd src/PharmaStock.Api && dotnet run --urls http://localhost:5080`
- To deploy: `dotnet build src/PharmaStock.Desktop/PharmaStock.Desktop.csproj -f net10.0-android -t:Run`
  (requires ANDROID_HOME/JAVA_HOME set, device connected+authorized, adb reverse set up, API running)
  — **except on the current test device** (a Xiaomi/Redmi running MIUI,
  model `M2101K9G`/`renoir_eea`), see the MIUI gotcha below; the Samsung
  SM-T733 tablet from earlier sessions doesn't have this restriction.
- **Use PowerShell for anything with Windows paths containing backslashes**
  passed as MSBuild properties (`-p:AndroidSdkDirectory=C:\...`) — Git
  Bash/MSYS mangles them. Plain builds/git are fine in either shell.

## Known gotchas hit this session (don't re-debug these)

- **MIUI blocks ADB-driven installs outright, on this specific test phone**
  (Xiaomi/Redmi `M2101K9G`): `dotnet build -f net10.0-android -t:Run` and
  even plain `adb install -r whatever.apk` both fail with
  `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` — this is not
  about USB debugging authorization (already granted) or the "Install via
  USB" / "MIUI optimization" developer-option toggles (tried, didn't fix
  it) — MIUI blocks the *install source* (adb) categorically, no matter
  what's toggled. The fix is **not** a one-time setting change — every
  future deploy to this device needs the same manual-sideload workaround:
  1. `dotnet publish src\PharmaStock.Desktop\PharmaStock.Desktop.csproj -f net10.0-android -c Release -p:AndroidSdkDirectory=C:\android-sdk`
     (must be **Release**, not the default Debug build — Debug uses Fast
     Deploy, which installs a thin ~15MB shell APK that relies on `-t:Run`'s
     adb-driven post-install file sync to actually push the app code; since
     that whole flow is blocked here, a manually-sideloaded Debug APK
     installs but crashes on launch with most of the app missing. Release is
     self-contained — ~50MB, everything bundled in the one APK.)
  2. `& "C:\android-sdk\platform-tools\adb.exe" push "src\PharmaStock.Desktop\bin\Release\net10.0-android\publish\com.pharmastock.app-Signed.apk" /sdcard/Download/PharmaStock.apk`
     (use PowerShell, not Git Bash — Bash's POSIX-path autoconversion mangles
     `/sdcard/...`, treating it as a Windows path)
  3. If updating an *already-installed* copy that was signed by a
     different debug/release keystore (e.g. from a different dev machine or
     a fresh keystore after this machine's tooling was reinstalled), the
     phone shows a signature-conflict error instead of upgrading — run
     `adb uninstall com.pharmastock.app` first, then install fresh.
  4. On the device: Files app → Downloads → tap `PharmaStock.apk` → Install
     (grant "install unknown apps" for Files if prompted). This is a
     genuine manual step — it can't be scripted away, since it's precisely
     the user-initiated install path (as opposed to adb) that MIUI allows.
  5. Newly pushed files sometimes don't show up in Files app until indexed —
     if it's missing, run:
     `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/PharmaStock.apk`
- **EF Core + Npgsql 8 + DateTime**: Npgsql refuses to persist a `DateTime`
  with `Kind != Utc`. A `DateTime` deserialized from JSON with no UTC
  offset comes in as `Kind=Unspecified`. Fixed globally via a
  `ValueConverter` applied to every `DateTime`/`DateTime?` property in
  `PharmaStockDbContext.OnModelCreating` — don't special-case individual
  endpoints for this again.
- **MAUI Shell absolute navigation**: a page only reachable via
  `Routing.RegisterRoute` (not declared as `ShellContent` in XAML) can fail
  unpredictably with `GoToAsync("//PageName")`. Fix used here: wrap each
  top-level page in its own `FlyoutItem` (flyout itself stays disabled) so
  it's a legitimate absolute-nav target without creating a visible tab bar
  (multiple `ShellContent` under one `FlyoutItem`/`Shell` auto-groups into a
  TabBar — that's why each gets its own `FlyoutItem`).
- **Unhandled exceptions in MAUI on Windows silently kill the process** — no
  dialog, no console output. There's now a WinUI-level
  `UnhandledException` handler in `Platforms/Windows/App.xaml.cs` plus
  broad `catch (Exception)` in every page's async-void handlers as a
  safety net. Keep this pattern for new pages.
- **robocopy's default `*.*` mask silently skips dotfiles/extensionless
  files** (this is how `.git/HEAD`, `.git/config` etc. were first "lost"
  before we found the real cloud copy) — use `Copy-Item -Recurse` in
  PowerShell instead if you ever need to script-copy a git repo.
- **Expo Go crashes on boot on the MIUI test phone — don't waste time
  debugging the JS for this, use a local dev client instead.** Symptom:
  Expo Go connects fine (bundle fetches successfully, confirmed via Metro
  log and even a raw on-device `curl` to the forwarded port), the app
  starts loading, then a native `SIGSEGV` in `libhermesvm.so` kills it —
  `adb logcat` shows `Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR)` in
  thread `mqt_v_js`, always at the *same* fault address, ~400ms after
  `ReactNativeJS: Running "main"`, no JS console output first. Ruled out by
  isolation testing (each made zero difference, still same fault address):
  disabling the `reactCompiler` experiment, replacing `crypto.randomUUID()`
  with `expo-crypto`, removing NativeWind's CSS import, and stripping
  NativeWind out of `babel.config.js` entirely. Conclusion: it's Expo Go's
  generic precompiled binary itself misbehaving on this device (MIUI is
  already known — see the ADB-install gotcha above — to interfere
  aggressively with non-Play-Store apps; likely the same root cause class,
  e.g. reclaimed shared-memory segments). **Fix: skip Expo Go, build and
  sideload a real native dev client**, same manual-install workaround as
  the MAUI app:
  1. `cd apps/mobile && npx expo run:android` — this prebuilds the native
     `android/` folder and runs a full Gradle build (~15-20 min the first
     time; fast on rebuilds). It will fail at the very last step trying to
     `adb install` — that failure is expected and fine, the APK is already
     built by then at
     `apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk`.
  2. `adb push` that APK to `/sdcard/Download/PharmaStockDev.apk`, media-
     scan broadcast if needed, manual Files-app install — identical steps
     to the MAUI gotcha above.
  3. Start Metro separately for subsequent JS-only iteration:
     `npx expo start` (no `--android`, so it doesn't retry the doomed
     auto-install) — the installed dev client connects to it automatically
     over the same `adb reverse tcp:8081 tcp:8081`.
  4. This dev client is a real compiled binary tied to this exact
     `node_modules` state — re-run `npx expo run:android` (and re-sideload)
     whenever a *native* dependency changes (new native module, Expo SDK
     bump), not for everyday JS/TSX changes (Metro Fast Refresh handles
     those against the already-installed client, same as normal RN dev).
  5. Once the app is already installed once via manual sideload, MIUI
     appears to allow subsequent `adb install` *upgrades* to the same
     package without the manual-tap step — seen on a later `npx expo
     run:android` re-run (new native module added) installing and
     launching automatically with no `INSTALL_FAILED_USER_RESTRICTED`.
     Only the very first install of a given package needs the manual
     Files-app tap; don't assume every rebuild needs it, but don't be
     surprised if it's still needed either (untested whether this holds
     after a full uninstall or a signature change).
- **`drizzle-orm`'s `db.transaction(async (tx) => {...})` on the
  expo-sqlite driver silently drops writes** (drizzle-orm 0.45.2 +
  expo-sqlite 57.0.1, tested 2026-07-30) — a pull-and-upsert function that
  awaited a long sequence of `tx.insert(...).onConflictDoUpdate(...)`
  calls inside one `db.transaction()` completed with no error, and the
  *last* statement (a `sync_state` bookkeeping row) landed correctly, but
  every insert before it silently didn't — confirmed by pulling the
  on-device SQLite file (`adb exec-out run-as <pkg> cat
  files/SQLite/<name>.db > local.db`, then inspect with
  `platform-tools/sqlite3.exe`, which ships alongside adb — note plain
  `adb shell ... cat` mangles binary data via the PTY, must use `adb
  exec-out`). **Fix: don't wrap multi-statement upsert sequences in
  `db.transaction()` on this driver** — issue each `db.insert()`/`db
  .update()`/`db.delete()` as its own top-level awaited statement instead
  (SQLite auto-commits per-statement anyway, so no atomicity is lost for a
  read-only sync mirror like this). Revisit if a future drizzle-orm/
  expo-sqlite version fixes this, but don't assume it's fixed without
  testing again the same way.
- **Expo Router group segments are transparent to the URL.** After nesting
  screens into `(app)/(drawer)/`, `router.push('/(app)/dashboard')`-style
  hrefs stopped type-checking. The correct, stable form is the plain
  `/dashboard` — confirmed via Metro's generated `.expo/types/router.d.ts`.
  Always use the plain form; never include the `(group)` segment in a href.
- **React Native's `Alert.alert` rendered dark/theme-broken on the MIUI
  test device**, ignoring the app's light theme entirely. Fixed once,
  app-wide, with a custom system: `src/lib/ui/alertStore.ts` (Zustand) +
  `src/components/AppAlertHost.tsx` (a themed `Modal`) + a `showAlert(title,
  message?, buttons?)` helper. Every new screen must use `showAlert`, never
  the bare `Alert.alert` — grep for `Alert\.alert` before adding a new
  confirmation dialog to confirm none crept back in.
- **Barcode scanner tuning**: narrowing `expo-camera`'s
  `barcodeScannerSettings.barcodeTypes` to "well-checksummed" formats
  seemed like the fix for wrong-product matches, but it silently excluded
  real physical product barcodes and broke detection entirely — reverted.
  The broad format list (`ean13, ean8, upc_a, upc_e, code128, code39,
  code93, itf14, codabar, qr`) is deliberate; don't narrow it again without
  testing against a real product barcode, not seed data. The actual fix
  for wrong-product matches was `findByBarcode`'s **exact**-only lookup
  (vs. the fuzzy name-substring fallback `getProductAvailability` uses for
  manual typing) plus a `CONFIRM_READS = 2` two-consecutive-frame
  confirmation before acting on a scan, in `src/app/(app)/scanner.tsx`.
  Per explicit user instruction, further scanner accuracy tuning was
  deliberately deprioritized in favor of finishing the feature phases —
  treat it as "good enough, not bulletproof," not "solved."
- **Debug-escalation rule** (learned from the Expo Go SIGSEGV saga): cap
  narrow same-shaped fix attempts at **2** before switching to a
  structurally different approach, rather than iterating small variations
  on a hunch that isn't panning out. The user will call out wasted
  iteration explicitly if this is ignored.
- **ADB/Gradle rebuild reliability**: (1) `adb kill-server && adb
  start-server` fixes most inexplicable hangs; (2) never run concurrent
  manual diagnostic `adb` commands while a build's own adb calls are
  in-flight — they queue/contend and look like a hang that isn't one; (3)
  a background build's output file can sit at 0 bytes for a long stretch
  on a genuinely healthy build (buffering, not hanging) — check the
  *newest* node/java process's CPU-time delta over an interval instead of
  trusting file size; (4) don't misattribute a stale leftover Gradle
  daemon's accumulated CPU time to the current build attempt — check
  `StartTime`, not just raw CPU, when there are multiple node/java
  processes running; (5) once an app is installed once via manual MIUI
  sideload, later `npx expo run:android`/`dotnet ... -t:Run` reruns
  auto-install fine without the manual Files-app step.
- **Currency formatting is deliberately not `Intl.NumberFormat`'s
  `currency` style** — a company's `currency` field is free text (not
  guaranteed ISO-4217), so `formatCurrency(amount, currency)` in
  `src/lib/format.ts` is a plain `amount.toLocaleString() + " " +
  currency`. Every amount shown anywhere in the app must go through this
  (or the `useCompanyCurrency`/`useCompanyInfo` hooks that supply the
  currency reactively from the local DB) — don't hardcode "XAF" or a `$`
  sign in a new screen.
- **PDF receipts** use `expo-print` + `expo-sharing`, not a native print
  library — `Print.printAsync({ html })` opens Android's native
  print-preview dialog, which doubles as both a PDF preview and "Save as
  PDF" (no separate download step needed). `Print.printToFileAsync` +
  `Sharing.shareAsync` handle direct share-sheet sending. The HTML/CSS
  template lives in `src/lib/receipt/generateReceiptHtml.ts` — always run
  interpolated values through its `escapeHtml()` helper.

## Immediate next steps (pick up here)

**All 8 phases of the original Expo plan are built.** The remaining work is
verification and a codebase reorg that a prior session started — not new
feature construction. State as of 2026-08-03:

**Phase 8 — Printing: DONE (was mislabeled "not started" in older notes).**
Built exactly as the plan sketched, including the bespoke native module:
- Pure-TS ESC/POS layer — `src/lib/printer/escpos.ts` + `cp850.ts` (CP850
  codepage, 32-char width), building receipt/test-page byte sequences.
- A real native Kotlin Expo module, **`apps/mobile/modules/pharmastock-printer/`**
  (`PharmastockPrinterModule.kt`), covering Bluetooth Classic SPP + USB Host
  raw bulk transfer, permission/enable prompts, and a deep link to Android's
  Bluetooth settings. Its generated `android/build/` + `android/.gradle/`
  are gitignored (some `.dex` names are too long for Windows to even index —
  see the root/`apps/mobile` `.gitignore`); the `android/src/` Kotlin IS
  tracked.
- `src/lib/printer/printingService.ts` (discover-all/select/authorize/print)
  + `printer-settings.tsx` screen, replacing the drawer's old "Printer" stub.

**New backend endpoints (also built this stretch, all mapped in `Program.cs`,
API builds clean):** per-user feature restrictions
(`FeatureRestrictionExtensions.cs` + `User.Restrict*` flags), staff roster /
activate / admin-password-reset / self-service change-password
(`AuthEndpoints.cs`), full-refund reversal (`RefundEndpoints.cs`), and the
Section 20 Services module CRUD (`ServiceEndpoints.cs`). Mobile consumers:
`staff.tsx`, `services.tsx`/`service-picker.tsx`, `change-password.tsx`,
`useFeatureGuard.ts`, refund in `sale-detail.tsx`. `AddUserFeatureRestrictions`
migration created.

**In-progress reorg:** `packages/core` (`@stockflow/core`) is a shared
workspace package being extracted from `apps/mobile/src/lib` (same subfolder
layout — api/printer/receipt/sync/…), toward the resale/multi-app goal. Root
is now an npm-workspaces monorepo (`apps/*` + `packages/*`, root
`package.json` name `stockflow`). This extraction is partial — expect some
duplication between `apps/mobile/src/lib` and `packages/core/src` until it's
finished.

**What's actually left:**
1. **On-device verification** (needs the physical MIUI device + a fresh
   `npx expo run:android` because the printer native module changes native
   code): click-test Phase 7 (Suppliers/Customers/Gift Cards/POs/Reports/
   Company settings/Staff/Services) *and* the printing feature (pair a real
   Bluetooth/USB thermal printer, test page, live receipt). None of this has
   been confirmed on-device by the user yet — it's all type-checked
   (`tsc --noEmit` clean) but unverified in the hand.
2. Finish (or deliberately pause) the `@stockflow/core` extraction so
   `apps/mobile` imports shared logic from the package instead of duplicating
   it. This also unblocks the desktop rebuild, which consumes `@stockflow/core`.
3. **Build the desktop client in Tauri + React** — not started. The complete
   guide (backend API reference, what to reuse from `@stockflow/core` vs
   replace, MAUI UX/design-system reference, and a 10-step build order) is
   **`docs/desktop-rebuild.md`**. Target `apps/desktop/`.

The legacy MAUI client was **deleted** on 2026-08-03 (see the "Client (legacy
MAUI)" note above and `docs/desktop-rebuild.md`). Don't try to revive it — the
desktop path forward is Tauri + React. If you ever need the old code for
reference, it's in git history (commits around `6bcc8ef`/`4ab4848`, and the
tree just before the deletion commit).
