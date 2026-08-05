# PharmaStock — session handoff (mobile ↔ desktop parity)

> Paste-ready context to resume the desktop→mobile parity work in a new session.
> Read `CLAUDE.md` and `docs/feature-parity-checklist.md` alongside this.

## Project
- Monorepo at **`C:\Dev\PharmaStock`** (npm workspaces).
- **Backend**: ASP.NET Core .NET 8 + EF + Postgres, `src/PharmaStock.Api` (runs on `http://localhost:5080`).
- **Desktop client** (reference, complete): `apps/desktop` — Tauri + React + Tailwind.
- **Mobile client** (being brought to parity): `apps/mobile` — Expo SDK **57** + React Native + NativeWind + expo-router + expo-sqlite/Drizzle.
- **Shared logic**: `packages/core` (`@stockflow/core`) — the API client, endpoints, types, business
  logic, offline sync, receipt templates, and i18n dictionary all live here and are used by BOTH
  clients. There is only ONE backend API; mobile's `src/lib/api/endpoints/*` just
  `export * from "@stockflow/core/..."`. The only layer that can't be shared is the UI (web
  `<div>`/Tailwind vs RN `<View>`/NativeWind), so each screen's UI is re-expressed in RN wired to the
  same API.
- Remote: `github.com/CeraphT/Stock-sales-Management`, branch `main`.

## Current task
Working **screen-by-screen** to make the mobile app match the desktop design + functionality (user
shares a desktop screenshot; match mobile to it). Before this, a full **mobile parity effort
(Phases 1–6)** was completed — all committed & pushed to `main`.

## What's DONE and committed (mobile)
- **Phase 1 design foundation**: dark palette unified to desktop slate, 18px `rounded-card`, Button
  `ghost`/`danger`, new `StatCard`/`StockBadge`/`Card`/`ToastHost`.
- **Phase 2 crash safety**: Expo Router `ErrorBoundary` in `(app)/_layout` + global handler.
- **Phase 3 data model**: My business (Tax ID/NIU, regime, receipt/contact); customer Business toggle + Tax ID.
- **Phase 5 tax/OHADA**: `tax-declaration.tsx` (VAT declaration + journals/cash-book/income-statement PDFs);
  receipt doubles as B2B invoice.
- **Phase 6**: dashboard rebuilt to match desktop (line chart, deep-link filters), gift-card voucher,
  rewards at checkout, inventory report, PO date-filter + reorder-consolidation, invite-code copy.
- **Phase 4 (native)**: Data & maintenance (backup/restore/reset/auto-daily-backup) — uses
  `expo-file-system`/`expo-document-picker`/`expo-clipboard`, imported LAZILY so the bundle loads
  without a rebuild.
- **Auth screens redesigned to match desktop** via shared `components/AuthLayout.tsx` (brand mark +
  card): onboarding (`index.tsx`), login, create-company, join-company.
- **POS/checkout** aligned: payment labels ("Credit (pay later)", "Store credit (prepaid)"),
  light-indigo selected style, store-credit balance display + validation, "New customer" in the picker.
- **Fixes**: reconciled drifted expo versions (`expo install --fix`); lazy-imported native modules;
  latest commit `3043d84` = drizzle migration `0001` adding `customers.tax_id` + `sales.tax_added_on_top`
  (mobile local SQLite schema was frozen at migration 0000).

## WHERE WE ARE RIGHT NOW (verify first)
Just fixed the sync error (`table customers has no column named tax_id`). User was reloading to confirm
the **55 products now sync and a sale can be rung up** — **UNVERIFIED**; confirm this first.
Verified server-side: demo company (login `699111222`/`test1234`, companyId
`8672c9c4-5cec-4c4b-b4ef-0c166b584f34`) has 55 products + 55 batches + 14 customers, and `sync/pull`
returns them.

## Environment state
- Metro was running (background); device connected (`5d23f540`); `adb reverse` set for 8081 (Metro) +
  5080 (API); API up on :5080. adb at `C:\android-sdk\platform-tools\adb.exe`.
- The app runs on the current dev client after login (lazy native imports) — full POS/catalog testable
  now; only backup/restore/copy actions need the native rebuild.
- **Native rebuild is pending and must be run by the USER**: `cd apps/mobile && npx expo run:android`.
  It fails when run through the assistant's tools (Gradle "Unable to establish loopback connection" — the
  tool sandbox blocks the daemon's loopback socket; the user's own terminal builds fine — `android/`
  already exists). Expect MIUI `INSTALL_FAILED_USER_RESTRICTED` → sideload
  `android/app/build/outputs/apk/debug/app-debug.apk`.

## Next steps
1. **Verify** products load + a POS sale completes on device (the migration fix).
2. Continue the **step-by-step screen parity pass** (user drives, screen by screen; POS was the latest).
3. **French i18n pass** on the new admin screens (Tax declaration, Data & maintenance, Inventory report
   use English literals; do this AFTER the native rebuild so it can be verified live).
4. **Native rebuild** by the user to enable backup/restore/copy.

## Key gotchas
- Mobile i18n is **keyed** (`t('key')`, dict in `packages/core/src/i18n/translations.ts`, en + fr
  blocks) — a missing key renders the raw key. `my-business`/new admin screens use English literals.
- Expo Router **eagerly evaluates every route file's top-level imports** at startup → keep
  native-module imports **lazy** (`await import(...)`).
- Mobile local DB schema changes need **`npx drizzle-kit generate`** (in `apps/mobile`) to produce a
  migration; `useMigrations` in `app/_layout.tsx` applies them on launch.
- Offline-first: catalog/POS read the **local SQLite mirror** populated by `syncApi.pull` — not the
  `/products` REST route.
- `drizzle db.transaction` silently drops writes on expo-sqlite — use individual statements.
- Windows: run Gradle/JDK-path commands in **PowerShell**; `JAVA_HOME`/`ANDROID_HOME` set user-level.
- Only authenticate with the demo account `699111222`/`test1234`.
- Each mobile change: type-check (`cd apps/mobile && npx tsc --noEmit`), then commit + push per screen.
