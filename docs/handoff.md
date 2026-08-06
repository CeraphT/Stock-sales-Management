# PharmaStock — session handoff (mobile ↔ desktop parity)

> Paste-ready context to resume the desktop ⇄ mobile parity work in a **new chat**.
> Read `CLAUDE.md` and (if present) `docs/feature-parity-checklist.md` alongside this.
> Last updated end of the 2026-08-05/06 session. **Working tree is clean; everything below is
> committed and pushed to `main`.**

## Project
- Monorepo at **`C:\Dev\PharmaStock`** (npm workspaces). Keep it OUT of any OneDrive/cloud-sync folder.
- **Backend**: ASP.NET Core .NET 8 + EF Core + PostgreSQL 17, `src/PharmaStock.Api` (runs on
  `http://localhost:5080`). `Api → Infrastructure → Domain`.
- **Desktop client** (Tauri v2 + React + TS + Tailwind): `apps/desktop`. Has a **browser dev mode**
  ("web view") that needs no native build — see "Run the web view" below.
- **Mobile client** (Expo SDK **57** + RN + NativeWind + expo-router + expo-sqlite/Drizzle): `apps/mobile`.
- **Shared logic**: `packages/core` (`@stockflow/core`) — API client, endpoints, types, business logic,
  offline sync, receipt/cash-report templates, i18n dict. Used by BOTH clients. Only the UI layer
  differs (web `<div>`/Tailwind vs RN `<View>`/NativeWind).
- Remote: `github.com/CeraphT/Stock-sales-Management`, branch `main`. Git user: Steve Foning.
- Demo login only: **`699111222` / `test1234`** (companyId `8672c9c4-5cec-4c4b-b4ef-0c166b584f34`,
  55 products, 14 customers).

## Run the web view (desktop, no device needed)
```bash
cd src/PharmaStock.Api && dotnet run --urls http://localhost:5080   # terminal 1 (API + CORS)
cd apps/desktop && npm run dev                                       # terminal 2 → http://localhost:5173
```
`npm run dev` runs the desktop client in a plain browser using the **sql.js** local-DB driver (vs
tauri-plugin-sql natively). `npm run tauri dev` opens the real native window (needs cargo on PATH:
`PATH="$HOME/.cargo/bin:$PATH"`). Both consume `@stockflow/core` and the same API.

## What this long session accomplished (all committed + pushed)
A screen-by-screen **desktop→mobile parity pass**, plus new cross-client features. Highlights:
- **Cash register / shifts**: full parity; **register-freeze gate** — if a user hasn't set the opening
  cash float for the day, the app is frozen until they do (`RegisterGate` on both clients; API
  `ShiftEndpoints` enforces + honours `RestrictCashRegister`).
- **Receipts**: VAT/tax line added (checkout `ReceiptData.taxTotal` now computed like sale-detail).
- **Dashboard**: 7D / 30D / 90D revenue-chart toggle on **both** clients; reconciliation banner.
- **Reconciliation** (new): API `ReconciliationEndpoints` (conflict shifts + negative batches, ack),
  `Reconciliation.tsx` (desktop) + `app/(app)/reconciliation.tsx` (mobile).
- **Sales history**: From/To date filters (`FilterChip` on mobile).
- **Customer credits**: selecting a customer shows the **orders/transactions** behind their owed /
  store-credit balance — API `GET /customers/{id}/credit-history` (falls back to `Sale.PaymentMethod`
  because there are ZERO PaymentSplit rows in the DB); `CustomerCredits.tsx` (desktop) + mobile
  `customer-detail.tsx`.
- **Granular permissions** (per explicit request — admin restricts *interfaces* themselves, not
  role-preset): `User.Restrict*` flags incl. new `RestrictCashRegister` + `RestrictGiftCards`; API
  round-trips them; desktop `Staff.tsx` + mobile `staff.tsx` give per-user toggles.
- **Staff**: cleaner admin UI; mobile Staff now also has a **"Change my password"** self-service
  shortcut (added last — see note below).
- **Printer + Data & maintenance**: simplified/reduced UI on both clients (user wanted less text).
- **Company settings**: 4-tab layout.
- **Products / Bulk stock**: parity incl. bulk stock **download + upload** template
  (`packages/core/src/bulk/bulkTemplate.ts`, desktop `lib/bulkUpload.ts`).
- **Suppliers / Purchase orders / Customers / Gift cards / Categories / Archived / Reports /
  Inventory report / Tax declaration**: parity pass incl. tap-to-call on contacts.
- **Mobile "More" menu**: redesigned into a **hub layout** (accent header, live search, quick-access
  tiles, grouped cards, settings card). File: `apps/mobile/src/app/(app)/(tabs)/more.tsx`.
- **Fixes**: dark-mode crash (console→toast mirror now defers via `setTimeout(0)` in
  `lib/globalErrors.ts`); "ID generator not initialized" (`setIdGenerator` at mobile startup).

## Password features (settled this session — do NOT "dedupe" them)
Two DIFFERENT features, both kept intentionally:
- **Self-service "Change password"** — `POST /api/auth/change-password`
  (`ChangePasswordRequest(CurrentPassword, NewPassword)`, verifies current pw, ANY authenticated user).
  Reachable from mobile **More → Settings** AND now from the **Staff** screen header
  ("Change my password" → routes to `change-password.tsx`). Kept in More because cashiers can't open
  Staff (admin-only, 403).
- **Admin reset** — `PUT /api/companies/{id}/users/{userId}/password`
  (`AdminResetPasswordRequest(NewPassword)`, no current pw, admin-only). This is the Staff-screen 🔑
  per-row action for resetting *someone else's* password.

## Environment / build reality
- I (assistant) **cannot run native Gradle builds** — the tool sandbox blocks the daemon's loopback
  socket ("Unable to establish loopback connection"). **The USER runs native builds**:
  `cd apps/mobile && npx expo run:android`. Expect MIUI `INSTALL_FAILED_USER_RESTRICTED` on the test
  phone → sideload `android/app/build/outputs/apk/debug/app-debug.apk` (see CLAUDE.md MIUI gotcha).
  → **This is a big reason to keep working in the desktop web view for now.**
- `adb reverse tcp:5080 tcp:5080` and `tcp:8081 tcp:8081` **drop on every USB reconnect** — first
  thing to re-check if the device suddenly can't reach the API/Metro. adb at
  `C:\android-sdk\platform-tools\adb.exe`.
- Standalone (off-PC) APK was explored then **reverted** per user (`configureApi` LAN IP + manifest
  cleartext were rolled back); mobile currently uses the core default `http://localhost:5080` via
  `adb reverse`.

## Key gotchas (don't re-debug)
- Mobile i18n is **keyed** (`t('key')`, dict `packages/core/src/i18n/translations.ts`, en+fr); missing
  key renders raw key. Newer admin screens still have some English literals — a **French i18n pass is
  the main deferred cleanup**.
- Desktop i18n uses **English-string-as-key** + FR map (`apps/desktop/src/lib/i18n.ts`).
- API registers **no `JsonStringEnumConverter`** → every C# enum serializes as an **integer**; client
  enums must match C# declaration order (`packages/core` enums / `apps/mobile/src/lib/api/enums.ts`).
  PaymentMethod: Cash=0 MobileMoney=1 Credit=2 StoreCredit=3 GiftCard=4.
- EF migrations: `dotnet-ef` pinned **8.0.10**; add with
  `dotnet ef migrations add X -p src/PharmaStock.Infrastructure -s src/PharmaStock.Api` then build
  (NOT `--no-build`) BEFORE `database update`, or the new migration isn't in the assembly.
- Mobile local DB schema change → `npx drizzle-kit generate` in `apps/mobile`; `useMigrations` in
  `app/_layout.tsx` applies on launch. `drizzle db.transaction` silently drops writes on expo-sqlite —
  use individual statements. Offline-first: catalog/POS read the local SQLite mirror from `sync/pull`,
  not the REST `/products` route.
- Mobile theme colors on the More screen must be inline `style` (className colors don't repaint on
  theme flip). `useThemeColors()` returns 6-digit hex; RN accepts 8-digit (`hex + '22'` for alpha).
- Windows: run Gradle/JDK-path commands in **PowerShell**.
- **Per-change workflow**: type-check (`cd apps/mobile && npx tsc --noEmit`, or desktop
  `cd apps/desktop && npx tsc --noEmit`), then commit + push per screen.

## Suggested next steps
1. Continue the parity pass in the **desktop web view** (`npm run dev`) — fastest loop, no device.
2. **French i18n pass** on newer admin screens (Tax declaration, Data & maintenance, Inventory report,
   Staff, My business, Reconciliation) — currently English literals.
3. On-device verification of the mobile work (needs the user's native rebuild + sideload).
4. Deferred/offered, unconfirmed: company-settings logo upload (expo-image-picker), country selector,
   in-app "Server address" field or hosted API for a standalone off-PC APK.
