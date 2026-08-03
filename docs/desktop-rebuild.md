# PharmaStock — Desktop Client Rebuild Guide (Tauri + React)

> **Purpose.** The legacy .NET MAUI desktop client (`src/PharmaStock.Desktop`)
> has been **deleted** (recoverable from git history — last present at commit
> `2edbb19`/before the deletion commit). This document captures everything that
> already exists — the backend API, the reusable `@stockflow/core` TypeScript
> layer, and the MAUI app's UX/design system — so a fresh desktop client can be
> built in **Tauri + React** with a first-class desktop UI, reusing the business
> logic already written for the Expo mobile app.
>
> **Chosen stack:** Tauri (Rust shell) + React + TypeScript + Tailwind CSS
> (e.g. shadcn/ui) + TanStack Query, consuming `@stockflow/core` and a local
> SQLite DB via `tauri-plugin-sql`. Android stays on Expo (`apps/mobile`); this
> desktop app is a **sibling app** in the same monorepo — put it at
> `apps/desktop/`.

---

## 0. Why this is cheap: the core is already portable

The mid-project `@stockflow/core` (`packages/core`) extraction split the app
into **UI-agnostic business logic** (portable) and **React-Native/Expo-specific
glue** (must be replaced). The extraction was done *with a desktop port in
mind* — core never imports a platform module; each app injects its platform
capabilities into core singletons at startup:

```ts
// apps/desktop startup (main.tsx) — the whole platform-binding surface:
configureApi("http://localhost:5080");          // api/client.ts
initDb(drizzleInstance);                          // db/client.ts  (Proxy registry)
setIdGenerator(() => crypto.randomUUID());        // idGenerator.ts
createAuthStore(tauriStoreAdapter, () => crypto.randomUUID()); // auth/store.ts
createLanguageStore(tauriStoreAdapter);           // i18n/store.ts
```

Everything below flows from that: **reuse the core, re-author the UI and ~6
platform adapters.**

---

## 1. Recommended architecture

```
apps/desktop/                 ← new Tauri + React app
├── src/                      ← React UI (screens, components, adapters)
│   ├── main.tsx              ← inject core singletons (see §0)
│   ├── platform/             ← the desktop replacements for RN/Expo glue (§3)
│   │   ├── db.ts             ← drizzle over tauri-plugin-sql → initDb()
│   │   ├── storage.ts        ← Tauri store/keyring → StateStorage adapters
│   │   ├── print.ts          ← HTML → window.print()/PDF; ESC/POS → transport
│   │   ├── printerTransport.ts ← Rust command (serial/USB/network 9100)
│   │   └── reactivity.ts     ← useLiveQuery replacement (§4)
│   ├── screens/              ← rebuilt UI (mirror MAUI IA, §7)
│   └── components/           ← Tailwind/shadcn components (mirror MAUI controls, §7.4)
└── src-tauri/                ← Rust: tauri-plugin-sql, printer transport command
```

- **UI:** React + Tailwind. Reuse `@stockflow/core/theme/colors` for the exact
  palette (§7.3). Recommend shadcn/ui for desktop-grade components.
- **Data fetching / reactivity:** TanStack Query, invalidated after every local
  write and after `syncNow()` — this is the `useLiveQuery` replacement (§4).
- **State:** reuse core's zustand stores verbatim (auth, cart, i18n, alert, scan).
- **Local DB:** drizzle over `tauri-plugin-sql` (or `better-sqlite3` sidecar),
  reusing `@stockflow/core/db/schema` unchanged.
- **Server platform:** send `DevicePlatform.Desktop = 0` on login.

---

## 2. Backend API reference

Base URL (dev): **`http://localhost:5080`** (`launchSettings.json`, `http`
profile — no HTTPS profile). Server is ASP.NET Core Minimal API + EF Core +
PostgreSQL. Unchanged by this rebuild.

### ⚠️ Three facts that will bite if missed

1. **No CORS policy is configured.** The Tauri webview origin will be blocked by
   the browser engine unless CORS is added server-side. **Action:** add a CORS
   policy in `Program.cs` allowing the Tauri origin (`tauri://localhost` /
   `http://localhost:<devport>`), or run requests through Tauri's Rust HTTP
   client (`tauri-plugin-http`) which is not subject to browser CORS.
2. **All enums serialize as integers.** No `JsonStringEnumConverter` is
   registered. Request bodies must send ints; responses contain ints. Use the
   tables in §2.3. (`@stockflow/core/api/enums.ts` already mirrors these.)
3. **DateTimes are coerced to UTC.** Npgsql requires UTC; a global
   `ValueConverter` forces `Kind=Utc` on every `DateTime`. Send UTC ISO-8601;
   date-only fields (batch expiry) are treated as UTC midnight. Never set
   `UpdatedAt` from the client — the server stamps it (it drives `since` sync).

### Auth model

- **JWT bearer** (HMAC-SHA256). `Authorization: Bearer <token>`. 60-min expiry.
- Claims: `NameIdentifier`=User.Id, `Name`=User.Name, `Role`=**enum name string**
  (`"CompanyAdmin"` — the one place an enum is a string, inside the token),
  `company_id`=CompanyId (absent for SuperAdmin).
- **Refresh rotation** (`POST /api/auth/refresh`): client persists a `DeviceId`
  (Guid, once per install); refresh token rotates on every use (old hash
  overwritten → replay fails). 30-day refresh expiry. `@stockflow/core/api/client`
  already implements single-flight 401→refresh→retry.
- Multi-tenancy: every request to `/api/companies/{companyId}/…` must match the
  token's `company_id` or gets 403. `LocationId` scopes batches/sales/movements/
  shifts/POs per branch. Every company gets a default "Main" location.

### 2.1 Endpoint index

Auth legend: **Auth**=any JWT · **Admin**=`RequireRole(CompanyAdmin,SuperAdmin)`
· **SA**=SuperAdmin only · **None**=anonymous. "Gate" = per-user feature
restriction (403 for a restricted Cashier; Admin exempt). Error bodies are
`{ message }` (French).

**Auth / staff** (`AuthEndpoints.cs`)
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| POST `/api/auth/login` | Login (phone+pw), upsert device, JWT+refresh | None | — |
| POST `/api/auth/refresh` | Rotate refresh → new JWT | None | — |
| POST `/api/auth/change-password` | Self change (verifies current) | Auth | — |
| POST `/api/companies/{companyId}/users` | Create staff | Admin | — |
| GET `/api/companies/{companyId}/users` | List staff | Admin | — |
| PUT `…/users/{userId}/active` | Deactivate/reactivate (no self) | Admin | — |
| PUT `…/users/{userId}/permissions` | Set feature restrictions | Admin | — |
| PUT `…/users/{userId}/password` | Admin reset pw (no current check) | Admin | — |

**Company / location**
| Method / route | Purpose | Auth |
|---|---|---|
| POST `/api/companies/` | Create company + first admin + "Main" location | None |
| POST `/api/companies/join` | Look up company by code | None |
| GET `/api/companies/{id}` | Get company | None |
| PUT `/api/companies/{id}` | Edit settings (tax/loyalty/services module) | Admin |
| POST `/api/companies/{companyId}/locations` | Add branch | Auth |
| GET `/api/companies/{companyId}/locations` | List branches | Auth |

**Catalog / stock**
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| GET `…/categories?search=` | List/search | Auth | — |
| POST/PUT/DELETE `…/categories[/{id}]` | CRUD | Auth | RestrictCatalog |
| GET `…/products?search=` | POS typeahead (active, cap 20) | Auth | — |
| GET `…/products/availability?query=` | Stock availability (single) | Auth | — |
| GET `…/products/catalog` | Paginated browse (filters: stockStatus[], favoritesOnly, expiringSoon, expired, archivedOnly) | Auth | — |
| GET `…/products/packaging-unit-names` | Distinct unit names | Auth | — |
| GET `…/products/restock-suggestions?supplierId&locationId` | Restock list | Auth | — |
| GET `…/products/{id}` | Detail | Auth | — |
| POST/PUT `…/products[/{id}]` | Create/update (+packaging levels) | Auth | RestrictCatalog |
| DELETE `…/products/{id}` · POST `…/{id}/restore` | Archive/unarchive | Auth | RestrictCatalog |
| POST `…/products/{id}/stock/receive` | New batch + Entry movement | Auth | — |
| POST `…/products/{id}/stock/adjust` | Manual adjust (reason, no-negative) | Auth | — |
| GET `…/products/{id}/batches` · `/movements` | Batch qty / movement history | Auth | — |

**Sales / refund / shift**
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| POST `…/sales` | Checkout (FEFO, splits, tendered, loyalty) | Auth | — |
| POST `…/sales/hold` · GET `…/sales/held` · DELETE `…/sales/{id}` | Hold/list/delete parked sale | Auth | — |
| GET `…/sales?page&from&to` | Completed history (page 20) | Auth | RestrictReportsAndFullSales → *narrows to own sales* (not 403) |
| GET `…/sales/{id}` | Sale detail (receipt) | Auth | — |
| POST `…/sales/{id}/refund` | Full refund (reverse stock/pay/loyalty) | **Admin** | — |
| POST `…/locations/{locId}/shifts/open` · GET `…/current` | Open / current shift (one open per loc) | Auth | — |
| POST `…/shifts/{id}/close` · GET `…/shifts?page` · GET `…/shifts/{id}` | Close / history / detail | Auth | — |

**Purchasing / suppliers**
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| GET/POST/PUT/DELETE `…/suppliers[/{id}]` | CRUD (delete 409 if referenced) | Auth | RestrictPurchasing |
| POST `…/purchase-orders` · GET `…/` · GET `…/{id}` | Create/list/detail | Auth | RestrictPurchasing (all routes) |
| POST `…/purchase-orders/{id}/lines/{lineId}/receive` | Receive → Batch + Entry movement | Auth | RestrictPurchasing |
| POST `…/purchase-orders/{id}/cancel` | Cancel (Pending only) | Auth | RestrictPurchasing |

**Customers / loyalty / gift cards**
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| GET `…/customers?search=` · POST `…/customers` | List/create (no update/delete/get-by-id) | Auth | RestrictCustomers (create) |
| POST `…/customers/{id}/loyalty/redeem` | Points → store credit | Auth | RestrictCustomers |
| GET/POST `…/giftcards` · GET `…/giftcards/lookup/{code}` · PUT `…/{id}/active` | List/issue/lookup/toggle (anonymous bearer, code `GC-XXXXXXXX`) | Auth | RestrictCustomers (mutations) |

**Reports / dashboard / services / sync / superadmin**
| Method / route | Purpose | Auth | Gate |
|---|---|---|---|
| GET `…/reports/sales-summary?locationId&from&to` | Revenue/cost/profit + daily | Auth | RestrictReportsAndFullSales |
| GET `…/reports/top-products?…&limit` | Top products by revenue | Auth | RestrictReportsAndFullSales |
| GET `…/dashboard/summary` | KPIs + 7-day trend + recent sales + conflict signals | Auth | — |
| GET `…/services` · POST/PUT `…/services[/{id}]` · PUT `…/{id}/active` | Services module CRUD (needs `ServicesModuleEnabled`) | Auth / **Admin** | RestrictCatalog (mutations) |
| POST `…/sync/push` · GET `…/sync/pull?locationId&since` | Offline sync (§5) | Auth | — |
| `/api/superadmin/*` | Cross-tenant admin + one-time `bootstrap` (header `X-Bootstrap-Secret`) | SA | — |
| GET `/health` | Liveness | None | — |

> Full request/response record field lists live in the endpoint source under
> `src/PharmaStock.Api/Services/` and are already typed in
> `@stockflow/core/api/types/*` + `endpoints/*` — **reuse those types; do not
> re-hand-transcribe them.**

### 2.2 Domain entities (key ones)

`Company` (currency default "XAF", tax 19.25%, loyalty rates, ServicesModuleEnabled,
unique code `PHRM-XXXXX`) · `User` (Role, Active, 4 `Restrict*` flags, CompanyId
null only for SuperAdmin) · `Device` (refresh-token hash, revoke/wipe flags) ·
`Location` · `Category`* · `Product`* (barcode, category/supplier, prices,
LowStockThreshold, TaxRateOverride, favorite) · `ProductPackagingLevel` (unit
name, qty-in-base-units, price override) · `Batch`* (location-scoped, expiry,
qty-in-base-units, cost) · `StockMovement` (append-only, signed qty, type) ·
`Supplier`* · `PurchaseOrder`(+`Line`) · `Customer`*(+`LoyaltyAccount` 1:1) ·
`GiftCard` · `Sale`(+`SaleLine` with BatchId+UnitPrice+TaxRatePercent,
`ServiceLine`, `PaymentSplit`) · `CashRegisterShift` · `Service`(+`ServiceStockLink`) ·
`InstallmentPlan`/`CustomFieldDefinition` (models exist, **no endpoints yet**).
`*` = `ITimestamped` (`UpdatedAt` auto-stamped, drives sync `since`). Money =
decimal(18,2); XAF has no minor units (display "N0").

### 2.3 Enums — wire values (0-based integers)

| Enum | Members (index = wire value) |
|---|---|
| **UserRole** | 0 Cashier · 1 CompanyAdmin · 2 SuperAdmin |
| **PaymentMethod** | 0 Cash · 1 MobileMoney · 2 Credit · 3 StoreCredit · 4 GiftCard · 5 Split |
| **SaleStatus** | 0 Completed · 1 Held · 2 Cancelled · 3 Refunded |
| **StockMovementType** | 0 Entry · 1 Sale · 2 Adjustment · 3 Return · 4 SupplierReturn · 5 Transfer · 6 ServiceConsumption |
| **PurchaseOrderStatus** | 0 Pending · 1 PartiallyReceived · 2 Received · 3 Cancelled |
| **ShiftStatus** | 0 Open · 1 Closed |
| **SyncStatus** | 0 Synced · 1 PendingPush |
| **DevicePlatform** | 0 Desktop · 1 Mobile · 2 Web |
| **InstallmentMode** | 0 Layaway · 1 InstallmentCredit |
| **CustomFieldEntityType** | 0 Product · 1 Customer · 2 Supplier |
| **CustomFieldType** | 0 Text · 1 Number · 2 Date · 3 YesNo |

---

## 3. `@stockflow/core` — reuse vs replace

`packages/core/src/index.ts` is an empty barrel; consumers **deep-import**
(`@stockflow/core/api/client`, `@stockflow/core/local/salesService`, …). The
mobile `apps/mobile/src/lib/*` tree is mostly thin re-export shims; the RN glue
is the handful of *non*-re-export files there.

### 3.1 Reuse as-is (pure TS — zero changes)

| Area | Modules |
|---|---|
| REST client + typed endpoints + DTOs + enums | `api/client`, `api/endpoints/*` (14), `api/types/*` (10), `api/enums` |
| Offline sync engine | `sync/syncNow`, `sync/syncPush`, `sync/syncPull` |
| Offline business logic | `local/salesService`, `local/stockDeduction`, `local/shiftService`, `local/catalogQueryService`, `local/dashboardQueries` |
| ESC/POS receipt **bytes** | `printer/escpos`, `printer/cp850`, `printer/types` |
| Receipt/report/PO **HTML** | `receipt/generateReceiptHtml`, `reports/generate{Report,List,PurchaseOrder}Html` (+ their type files) |
| State stores (zustand) | `cart/store`, `ui/alertStore`, `scan/captureStore`, `auth/store`, `i18n/store` |
| i18n | `i18n/useTranslation`, `i18n/translations` (catalog/purchasing/admin still EN-only) |
| Misc | `format` (formatCurrency, labels), `idGenerator`, `theme/colors`, `db/schema`, `db/writeLock`, `db/client` (registry+Proxy), `bulk/parseBulkStock` |

### 3.2 Replace for desktop (the RN/Expo glue)

| RN/Expo piece | Desktop replacement |
|---|---|
| `expo-sqlite` (`drizzle-orm/expo-sqlite`) | `drizzle-orm/sqlite-proxy` over **`tauri-plugin-sql`** (or `better-sqlite3` sidecar), then `initDb(db)` — schema reused unchanged |
| **`useLiveQuery`** reactive hooks | **TanStack Query invalidated on write/`syncNow`**, or a "db-version" zustand signal → re-query. *The one non-mechanical port* (§4) |
| `pharmastock-printer` native module (BT SPP + USB) | **Tauri Rust command** using `serialport`/`rusb`/`btleplug`, or network raw-print (port 9100), or OS print spooler. Re-implement the `printingService` façade (`discoverAll/selectPrinter/printReceipt/printTestPage`); the Android USB-permission flow drops away |
| `expo-print` (`printAsync`/`printToFileAsync`) | Feed the **already-portable HTML** to `window.print()` (hidden iframe) or a Tauri print-to-PDF command |
| `expo-sharing` | Tauri `save` dialog + `shell open` (or Web Share where available) |
| `expo-secure-store` | **Tauri store plugin / OS keyring** exposed as `StateStorage`/`KeyValueStorage` — auth/i18n stores already accept an injected adapter |
| `expo-crypto.randomUUID` | `crypto.randomUUID()` (native in webview) |
| `expo-device` | Tauri `os`/`app` APIs; send `DevicePlatform.Desktop` (0) |
| **NativeWind** | **Tailwind CSS** with `dark:`; drive scheme via `class`/`data-theme` on `<html>`. Reuse `theme/colors` |
| `expo-camera` barcode | **Hardware USB/HID scanner (keyboard-wedge)** as primary desktop path (often no camera at all); optionally `@zxing/browser` / `BarcodeDetector` over `getUserMedia`. Reuse `scan/captureStore` |
| `react-native` primitives + all `app/` screens | Full rebuild in React DOM (mirror MAUI IA, §7). `alertStore` logic reused; only the host modal re-authored |

---

## 4. The one tricky port: reactivity

Mobile relies on `useLiveQuery` (from `drizzle-orm/expo-sqlite`, enabled by
`enableChangeListener:true`) so hooks like `useCompanyCurrency`, `useCompanyInfo`
and the catalog screen auto-refresh when rows change. **`sqlite-proxy` has no
live-query.** Options, cheapest first:

1. **TanStack Query** for all reads; call `queryClient.invalidateQueries()` after
   every local write (checkout, shift, receive/adjust) and after each `syncNow()`.
   Because all writes funnel through `localDbWriteLock`/the local services and
   `syncNow`, there are a small number of invalidation points.
2. A tiny "db-version" zustand counter bumped at those same points, with reads in
   `useEffect(..., [dbVersion])`.

Everything else in the DB layer (`schema`, `writeLock`, the `db` Proxy registry)
is reused unchanged; only `db/client`'s driver construction differs. If
`tauri-plugin-sql` supports real transactions, the mobile "validate-before-write"
and transaction-less `pullAll` workarounds remain correct (they can optionally be
hardened, but no change is required).

---

## 5. Sync protocol (reused verbatim from core)

`syncNow()` runs one cycle inside `localDbWriteLock`: resolve `locationId`
(self-heal via `locationsApi.list`) → **push, then pull only if push had 0
failures** (pulling first would clobber batch quantities not yet reflecting this
device's un-pushed deductions).

- **Push** (`syncPush`): gather `sales` + `cashRegisterShifts` where
  `syncStatus = PendingPush`, reconstruct stock movements from sale lines
  (negative qty, `Sale` type), build shift open/close, POST `…/sync/push`. Server
  echoes per-id `applied`; only confirmed rows flip to `Synced`. Client-generated
  ids ⇒ naturally idempotent. `serviceLines` always `[]` (not yet implemented).
- **Pull** (`syncPull`): incremental via `since` watermark in `syncState`.
  **FK-safe dependency order:** Company → Users → Locations → Categories →
  Suppliers → Customers(+Loyalty) → GiftCards → Products(+PackagingLevels) →
  Batches → StockMovements. Upserts via `onConflictDoUpdate`; packaging levels
  delete+reinsert per product; movements insert-if-absent. **Not wrapped in a
  transaction** (expo-sqlite gotcha; re-evaluate for the desktop driver).
  `resolveSince` self-heals: forces a full pull if a watermark exists but this
  company's products are empty.

---

## 6. Local DB tables (drizzle, `db/schema.ts` — reused unchanged)

`companies, locations, users` (display cache; login always hits API),
`categories, suppliers, customers, loyaltyAccounts` (PK=customerId), `giftCards,
products` (idx barcode, categoryId), `productPackagingLevels, batches` (idx
productId+locationId), `stockMovements` (append-only), `cashRegisterShifts,
sales` (local-only `syncStatus`), `saleLines, paymentSplits, syncState`
(watermark). String PKs = client-generated ids. Booleans as `integer({mode:
"boolean"})`, money as `real`, timestamps/dates as ISO `text`, enum columns as
raw `integer` (match `api/enums`).

---

## 7. UX & design-system reference (captured from the deleted MAUI app)

Rebuild the **information architecture and design language** below, but improve
the execution (real desktop layouts, denser dashboards, keyboard-first flows).
The MAUI app was single-column almost everywhere; desktop should exploit width.

### 7.1 Information architecture (sidebar)

Custom Slack/Discord-style **green gradient sidebar** with collapsible grouped
sections. Header shows app name + `UserName · Role`. On Windows the sidebar is
**docked/locked** (pushes content) with a 48px title bar holding: ☰ toggle,
page title, and — when authenticated — **Sync** + **Logout**; pre-auth shows
only Language + Theme.

- **Dashboard** (ungrouped)
- **Sales** *(default-expanded, highest traffic)* — POS · Cash register · Sales history · Held sales
- **Catalog** — Products · Categories · Archives
- **Purchasing** — Suppliers · Purchase orders
- **Clients** — Customers · Gift cards
- **Management** — Reports · Printer settings · Company settings

Sub-pages (product edit, stock receive/adjust, sale detail, PO create/detail/
receive, supplier edit) are pushed on top; pickers + scanner are modal.

### 7.2 Screen inventory (condensed)

- **Auth/Onboarding** — Onboarding (3 CTAs), Login (phone+pw, eye toggle,
  Enter-chaining), Create Company (2-step wizard), Join Company (code lookup).
  Centered card, 420–480px, gradient bg.
- **POS** *(the responsive win)* — barcode entry (accepts scanner wedge) +
  search + cart on the left; **fixed ~420px checkout panel** on the right at
  width ≥700, stacking when narrow. 6 payment chips with conditional panels
  (cash tendered→change; split cash+MM sum-to-total; credit/store-credit require
  customer; gift-card code). Hold/Resume.
- **Cash register** — open/active shift (opening cash, 2×2 stats, close w/ notes,
  discrepancy) + shift history.
- **Sales history / Held sales** — date-range chips + custom range, payment-accent
  cards, pagination, Excel export. **Sale detail** = on-screen receipt + print.
- **Catalog** — product list (left accent bar = stock status, favorite ★,
  expiry badge, LoadMore), **Product edit** (General / Price&Stock / Packaging
  levels cards + receive/adjust/archive actions), Categories, Archived (restore),
  Filter modal, pickers, Barcode scanner (camera; desktop = wedge-first).
- **Purchasing** — PO list (status chips + supplier filter), PO create
  (supplier + restock suggestions + line builder), PO detail (per-line Receive,
  Cancel), Receive-line modal, Suppliers CRUD.
- **Clients** — Customers (balances shown), Customer picker, Gift cards
  (issue/toggle, status pill).
- **Reports** — date range + **4-across KPI row** (revenue/profit/count/avg) +
  daily breakdown + top products (Excel export). *Widen into a desktop grid.*
- **Settings** — Company settings (name/currency/tax/loyalty/invite code),
  Printer settings (device list, pair, test print).
- **Dashboard** — **3-col stat-tile grid** (9 KPIs incl. low/out/expiring/
  expired/negative-stock) + 7-day revenue column chart + stock-health doughnut +
  recent sales. (MAUI used Syncfusion charts; on web use Recharts/visx — see the
  `dataviz` skill.)

### 7.3 Design tokens — palette (from `Colors.xaml`, mirrored in `theme/colors.ts`)

Pharmacy **green** brand (not the MAUI purple). Dark mode handled per-property.

| Token | Light | Dark |
|---|---|---|
| Primary | `#1E8A6E` | `#5FBFA3` |
| Primary deep (sidebar end / on-green text) | `#0B2B22` | — |
| Background | `#F5F8F7` | `#14181A` |
| Surface (card) | `#FFFFFF` | (Gray tints) |
| Text primary / secondary | `#1F2937` / `#6B7280` | inverted |
| Border | `#E3E7E5` | — |
| Error / Success | `#DC2626` / `#16A34A` | — |
| Accent Blue (solid/soft) | `#2563EB` / `#DBEAFE` | — |
| Accent Purple | `#7C3AED` / `#EDE3FC` | — |
| Accent Amber (low stock) | `#D97706` / `#FEF3C7` | — |
| Accent Orange (expiring) | `#EA580C` / `#FFE4D5` | — |

**Payment-method colors:** Cash→Success, MobileMoney→Blue, Credit→Amber,
StoreCredit→Purple, GiftCard→Orange, Split→Gray. Used as sales-row accent bars +
receipt badges.

Type: Open Sans (body 14, label 12 bold +0.5 tracking, section 15 bold, page
title 26 bold 1-line-truncate, headline 32, big total 24, stat value 18). Icons:
Bootstrap Icons (map to `lucide-react` on web). Radii: buttons/fields **12**,
cards **18**, pills **20/8**. Card shadow: black 8% / blur 24 / y+6. Sidebar is a
diagonal Primary→deep-green gradient, white text, theme-invariant.

### 7.4 Reusable controls → React components

`FormField` (labeled input + password eye + Enter-chaining) · `IconButton`
(icon-font glyph + text, Primary/Secondary) · `StatTile` (soft-circle badge +
glyph + big colored value + caption) · `StatusBadge` (colored pill) ·
`CollapsibleSearchBar` · `FlyoutSection` (collapsible sidebar group) ·
`LanguageSwitch` (FR/EN segmented pill) · `Toast` (transient bottom bubble,
red/green). Rebuild as Tailwind/shadcn components.

### 7.5 UX patterns to preserve

- **Barcode:** keyboard-wedge entry firing on Enter is the **primary desktop
  path**; camera optional. Funnel through availability lookup → add to cart;
  404 → localized "not found".
- **Checkout:** debounced search (350ms), out-of-stock sorted last w/ badges,
  packaging-unit chooser on add, conditional payment panels, checkout disabled
  until valid, 409 preserves the cart, success → offer print.
- **Hold/resume:** hold parks server-side (no deduction) + clears local; resume
  requires empty cart (no silent merge), repopulates rescaling base-unit price
  back to packaging unit, then deletes the held row.
- **Sync:** manual Sync button → `syncNow()` → toast ("X sent, Y received" /
  "up to date" / red on failure). *Improve with a live pending-count/connectivity
  indicator.*
- **Language (FR default / EN)** and **theme (light/dark)** toggles in the title
  bar; sidebar stays green. All strings via `i18n` (missing key shows the key).
- **Keyboard-first forms:** Enter walks fields and submits.
- **Excel export** on Sales history / Held sales / Reports (MAUI used a native
  exporter; on desktop use a JS xlsx lib or a Tauri command).

---

## 8. Suggested build order

1. **Scaffold** `apps/desktop` (Tauri + React + Tailwind + TanStack Query), add
   `@stockflow/core` as a workspace dep, wire the injection points (§0). Add the
   **server CORS policy** (§2). Prove `authApi.login` end-to-end.
2. **Platform adapters** (§3.2): Tauri-store `StateStorage`, `initDb` over
   `tauri-plugin-sql` with `db/schema` migrations, `crypto.randomUUID` id gen.
3. **Reactivity** decision (§4) — pick TanStack-Query invalidation.
4. **Shell + IA** (§7.1): docked sidebar, title bar (sync/logout/lang/theme),
   routing. Port the control set (§7.4) + palette (§7.3).
5. **Read-only first:** Dashboard + Catalog browse driven off a sync pull
   (verify row counts vs Postgres, as the mobile app did).
6. **POS + checkout** (the responsive two-pane, §7.2) on `localSalesService`.
7. Sales history/detail, hold/resume, cash register/shifts.
8. Catalog/stock CRUD, purchasing, customers/loyalty/gift cards, reports,
   services, staff, company settings.
9. **Printing:** HTML receipt via `window.print()`/PDF **and** ESC/POS bytes via
   a Tauri printer-transport command (§3.2) + printer-settings screen.
10. Barcode wedge input, Excel export, polish, on-device print testing.

---

## 9. Gotchas carried over (see root `CLAUDE.md` for the full list)

- **Integer enums** over the wire (§2). **UTC datetimes** (§2). **No CORS yet** (§2).
- **`formatCurrency` is deliberately not `Intl` currency style** — currency is
  free text; it's `amount.toLocaleString() + " " + currency`. Route every amount
  through `@stockflow/core/format`.
- **Sync push-then-pull ordering** and **FK-safe pull order** are load-bearing (§5).
- **`localDbWriteLock`** must wrap every local write (checkout, shift, pull-apply).
- Re-evaluate the **transaction-less** sync/checkout workarounds for the new
  SQLite driver (§4) — they stay correct even if the driver supports transactions.
