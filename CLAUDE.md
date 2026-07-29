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

One language (C#) end to end:
- **Backend**: ASP.NET Core Web API (.NET 8) + EF Core + PostgreSQL — `src/PharmaStock.Api`, `.Domain`, `.Infrastructure`
- **Client**: .NET MAUI — `src/PharmaStock.Desktop` (name is historical; it now multi-targets `net10.0-android` *and* `net10.0-windows10.0.19041.0` from one codebase)
- **Web (Blazor)**: not started yet

Dependency direction: `Api → Infrastructure → Domain`, never reversed — this
is what lets `Domain`/`Infrastructure` be reused unmodified inside the MAUI
client pointed at local SQLite instead of Postgres, once offline-first sync
(Section 6) is built.

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
- Known model gaps not yet closed: cash-register/shift reconciliation
  (Section 3.6 — the one remaining Phase-1 MVP item), purchase orders,
  refresh tokens, GiftCard/StoreCredit redemption, held/parked sales,
  reporting endpoints (Section 14)

### Client (MAUI) — onboarding flow only, both platforms confirmed working
- Screens built: Onboarding (landing) → Create Company / Join Company /
  Log In → Dashboard (placeholder showing session info)
- `PharmaStockApiClient` (Services/) wraps the API over plain HTTP;
  `SessionService` persists the JWT via MAUI Preferences (stopgap — real
  design is local SQLite + device-bound refresh token, once Section 6 sync
  is built)
- **Confirmed running on both Windows and the user's physical Android
  tablet** (Samsung SM-T733, connected via USB, `adb reverse tcp:5080
  tcp:5080` forwards the API so the app's `http://localhost:5080` constant
  works unchanged from the device)
- Not yet built: the actual POS/cart screen (Section 3.1, the big one),
  product catalog UI, stock screens, adaptive tablet/phone layout (only
  matters once there's a screen complex enough to need it — onboarding is
  fine as-is on any screen size)

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

## Immediate next steps (pick up here)

1. Confirm with the user the tablet still shows the onboarding screen
   correctly from `C:\Dev\PharmaStock` (last verified: yes, installed and
   running, `com.pharmastock.app` process confirmed via `adb shell ps`).
2. Build the actual POS/cart screen for Mobile (Section 3.1) — full
   workflow: barcode scan, cart, payment, receipt, stock deduction — using
   the existing Sales endpoint. This is the big remaining piece.
3. Adaptive layout: branch on `DeviceInfo.Current.Idiom` once the POS
   screen exists (tablet = fuller/multi-column, phone = simplified).
4. Product catalog and stock screens (receiving, adjustment) in the client.
5. Cash-register/shift reconciliation on the API side (last Phase-1 MVP gap).
