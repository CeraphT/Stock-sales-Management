# PharmaStock — Feature Parity Checklist

**Purpose.** The **desktop client** (`apps/desktop`, Tauri + React) is the most
complete reference implementation of the product. This document catalogues every
feature it ships, so it can be used as a **build/verify checklist for the mobile
client** (`apps/mobile`, Expo/React Native) and the **web client**
(`src/PharmaStock.Web`, Blazor — currently only a SuperAdmin shell).

**How to read the columns**
- **Desktop** — ✅ built & working in `apps/desktop`.
- **Mobile** — parity status in `apps/mobile`. `☑` = built (Expo phases 1–8), `?` = built earlier but **not yet re-verified against the newest desktop behaviour**, `☐` = not built.
- **Web** — `☐` = not built (only the SuperAdmin area exists today).

Backend note: every feature below is backed by an existing ASP.NET Core endpoint
(`src/PharmaStock.Api/Services/*Endpoints.cs`). Enums serialize as **integers**
(no `JsonStringEnumConverter`), so any client's enum order must match the C#
declaration exactly.

---

## 1. Auth & onboarding
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Create company + first admin + default "Main" location (one transaction, returns JWT) | ✅ | ☑ | ☐ |
| Join existing company by invite code | ✅ | ☑ | ☐ |
| Copy company invite code (share to invite another company/branch) | ✅ | ? | ☐ |
| Login (phone + password, JWT + refresh token) | ✅ | ☑ | ☐ |
| Device registration payload on login (DeviceName required — bare API login 500s without it) | ✅ | ☑ | ☐ |
| Refresh-token rotation (`POST /api/auth/refresh`) | ✅ | ☑ | ☐ |
| Idle auto-logout (till left unattended) | ✅ | ☑ | ☐ |
| First-login setup wizard (admin, company not yet configured) | ✅ | ☑ | ☐ |
| Redesigned auth pages aligned to app theme | ✅ | ? | ☐ |

## 2. Company settings & profile
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Name, currency, tax rate, loyalty rates | ✅ | ☑ | ☐ |
| Tax ID / NIU (shown on all receipts & reports) | ✅ | ? | ☐ |
| Profile fields: logo, address, phone, receipt footer | ✅ | ? | ☐ |
| Tax regime selector (Réel / Impôt libératoire flat tax) | ✅ | ? | ☐ |
| Branch (location) list, read-only join code | ✅ | ☑ | ☐ |
| Tabbed/sectioned settings layout | ✅ | n/a | ☐ |

## 3. Dashboard
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Stat tiles (revenue, stock health, etc.) | ✅ | ☑ | ☐ |
| Revenue-trend + stock-health charts | ✅ | ☑ | ☐ |
| Clickable stat cards → deep-link into filtered screens | ✅ | ☐ | ☐ |

## 4. Products / catalog
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Product list, search | ✅ | ☑ | ☐ |
| Packaging hierarchy (box / blister / unit) | ✅ | ☑ | ☐ |
| Create / edit / archive / restore product | ✅ | ☑ | ☐ |
| Categories CRUD | ✅ | ☑ | ☐ |
| HID barcode scanner input (keyboard-wedge, `useScanGun`) | ✅ | ☑ (camera) | ☐ |
| Per-product tax rate | ✅ | ☑ | ☐ |

## 5. Stock
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Receive stock (creates Batch + cost + expiry) | ✅ | ☑ | ☐ |
| Manual adjustment (mandatory reason, can't go negative) | ✅ | ☑ | ☐ |
| Per-product inventory / batch / movement history | ✅ | ☑ | ☐ |
| Batch VAT-rate capture on receipt (for purchase VAT) | ✅ | ? | ☐ |
| **Bulk stock register — paste rows** | ✅ | ? | ☐ |
| **Bulk stock — upload a filled template (.xlsx/.xls/.csv), auto-fill missing fields (generate barcode, default prices/qty/batch)** | ✅ | ☐ | ☐ |

## 6. POS / checkout
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Cart, barcode scan + manual search | ✅ | ☑ | ☐ |
| FEFO stock deduction via StockMovement rows (per-location) | ✅ | ☑ | ☐ |
| Packaging-aware pricing | ✅ | ☑ | ☐ |
| Mixed product + service lines | ✅ | ☑ | ☐ |
| All payment methods + split payments | ✅ | ☑ | ☐ |
| Credit sale against Customer.CreditBalance | ✅ | ☑ | ☐ |
| Hold / resume sale (with stock-shortfall warning on resume) | ✅ | ☑ | ☐ |
| Offline sale push (idempotent) | ✅ | ☑ | ☐ |
| Auto-print receipt after sale (configurable) | ✅ | ☑ | ☐ |

## 7. Sales history / detail / refund
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Paginated history (infinite scroll), date-range filter | ✅ | ☑ | ☐ |
| Sale detail view | ✅ | ☑ | ☐ |
| Full-refund reversal | ✅ | ☑ | ☐ |
| Batch receipt download/print for a filtered set | ✅ | ? | ☐ |
| Colored PDF sales report export | ✅ | ? | ☐ |
| **Gift-card issuances are NOT shown in Sales History** (they live on the Gift Cards screen; sales ledger = real sales only) | ✅ | ⚠ shows them as audit lines — intentional divergence, revisit | ☐ |

## 8. Cash register / shifts
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Open shift with starting cash (cashier start-of-day gate) | ✅ | ☑ | ☐ |
| Shift auto-close conflict handling on sync | ✅ | ☑ | ☐ |
| Cash reconciliation report (`cashReport`) | ✅ | ? | ☐ |

## 9. Suppliers
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Suppliers CRUD | ✅ | ☑ | ☐ |

## 10. Customers, credit & loyalty/rewards
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Customers list / create (no update/delete/get-by-id by design — filter list client-side) | ✅ | ☑ | ☐ |
| Credit balance (owed) — distinct from store credit | ✅ | ☑ | ☐ |
| Loyalty points (hidden accrual) | ✅ | ☑ | ☐ |
| Reward program → issue reward gift cards (`RewardEndpoints`) | ✅ | ? | ☐ |
| Customer credits screen | ✅ | ? | ☐ |
| B2B customer flag + Tax ID (`IsBusiness`, `TaxId`) | ✅ | ? | ☐ |

## 11. Gift cards
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Issue / list / toggle active (anonymous bearer, `GC-XXXXXXXX`) | ✅ | ☑ | ☐ |
| Printable gift-card voucher | ✅ | ? | ☐ |

## 12. Purchase orders
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Create PO with product-line builder | ✅ | ☑ | ☐ |
| Per-line partial receiving (creates Batch + StockMovement) | ✅ | ☑ | ☐ |
| Append line to existing PO + batch VAT capture | ✅ | ? | ☐ |
| Cancel while Pending only | ✅ | ☑ | ☐ |
| Consolidate reorders → one PO per supplier | ✅ | ? | ☐ |
| Date-range filter on PO list | ✅ | ☐ | ☐ |

## 13. Reports
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Date-range sales summary + top products | ✅ | ☑ | ☐ |
| Deep-link KPIs → filtered screens | ✅ | ☐ | ☐ |
| Inventory report | ✅ | ? | ☐ |
| Total-tax with B2B branch | ✅ | ? | ☐ |
| NIU/Tax ID on all report PDFs | ✅ | ? | ☐ |

## 14. Tax (Cameroon / OHADA)
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| VAT-inclusive pricing; **rate 0 = tax off** (no separate toggle column) | ✅ | ? | ☐ |
| B2B VAT added **on top** (rate/100) vs B2C extracted from inclusive price | ✅ | ? | ☐ |
| Compliant B2B invoice (invoice number, seller + buyer NIU) | ✅ | ? | ☐ |
| Impôt libératoire flat-tax regime | ✅ | ? | ☐ |
| OHADA TVA declaration (SYSCOHADA accounts 4431/4452/4441) | ✅ | ☐ | ☐ |
| Sales journal, purchases journal (real purchase VAT) | ✅ | ☐ | ☐ |
| Cash book (livre de caisse) | ✅ | ☐ | ☐ |
| Simplified income statement | ✅ | ☐ | ☐ |

## 15. Services module
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Services CRUD, service lines on a sale | ✅ | ☑ | ☐ |

## 16. Staff & permissions
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Staff roster, activate / deactivate | ✅ | ☑ | ☐ |
| Admin password reset for a user | ✅ | ☑ | ☐ |
| Self-service change password | ✅ | ☑ | ☐ |
| Per-user feature restrictions (`Restrict*` flags + guard) | ✅ | ☑ | ☐ |
| Role-gated UI (CompanyAdmin / Cashier / SuperAdmin) | ✅ | ☑ | ☐ |

## 17. Printing
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| HTML receipt → system print dialog / Save-as-PDF | ✅ | ☑ | ☐ |
| Receipt paper width (58 / 80 mm / A4) | ✅ | ☑ | ☐ |
| Copies-per-receipt | ✅ | ? | ☐ |
| **Direct ESC/POS thermal printing (receipts only, no dialog)** | ✅ (native Rust transport) | ☑ (native Kotlin module) | ☐ |
| **Zero-config printer auto-detect** (USB / USB-C / Bluetooth → one "Detect" button; friendly device names; no COM-port/baud UI) | ✅ | ☐ (mobile uses BT/USB pairing UI) | ☐ |
| Network printer fallback (host:port) | ✅ | ? | ☐ |
| Reset / disconnect printer | ✅ | ? | ☐ |
| ⛔ Cash-drawer kick pulse | ☐ | ☐ | ☐ |

## 18. Sync (offline-first)
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Local SQLite mirror (17 tables) + Drizzle | ✅ (dual-driver: tauri-plugin-sql / sql.js) | ☑ (expo-sqlite) | ☐ |
| Pull in dependency order, since-reset self-heal | ✅ | ☑ | ☐ |
| Idempotent push, server re-derives money fields | ✅ | ☑ | ☐ |
| Push-then-pull orchestrator, write lock | ✅ | ☑ | ☐ |
| Tenant isolation — wipe local mirror if device switched companies | ✅ | ☑ | ☐ |
| ⛔ Automatic periodic sync + persistent status indicator (manual button only today) | ☐ | ☐ | ☐ |

## 19. Data & maintenance (backup / restore / reset)
Admin-only screen (Management → Data & maintenance). Every action is **strictly
scoped to the signed-in company** — the tenant-isolation guard runs before
backup, and restore refuses a file whose `companyId` differs, so an admin can
never touch another business's data on a shared device.
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| Admin-only gate (cashier blocked) | ✅ | ☐ | ☐ |
| **Automatic daily backup** — catch-up scheduled (fires ~02:00 if running, else at first launch after); rolling 14-day retention, one file per day so today never overwrites yesterday; stored in the app-data `backups/` folder next to the DB; purely local (no internet needed) | ✅ | ☐ | ☐ |
| **Back up** (manual) — export the full local mirror (all 16 business tables) to one JSON file (native → Downloads; browser → download) | ✅ | ☐ | ☐ |
| Backup is company-scoped (isolation guard runs first; `companyId` stamped in the file) | ✅ | ☐ | ☐ |
| **Restore** — upload a backup file; **refuses a different company's file** | ✅ | ☐ | ☐ |
| Restore **recap** — per data-type counts: rows in file · matching existing · new | ✅ | ☐ | ☐ |
| Restore **multiselect** — tick which data types to apply, select-all/none | ✅ | ☐ | ☐ |
| Restore **Add new only** — insert new rows, keep existing unchanged | ✅ | ☐ | ☐ |
| Restore **Replace selected** — upsert: overwrite matching rows, add new | ✅ | ☐ | ☐ |
| **Confirm restored data as source of truth** — after restore, admin is asked to push restored **unsynced sales/shifts** to the server (idempotent by id); already-synced sales skipped automatically | ✅ | ☐ | ☐ |
| Catalogue/customers stay **server-owned** — restore is local; they reconcile downward on the next pull (a stale backup can't overwrite server-side financial records) | ✅ | ☐ | ☐ |
| **Reset (complete refresh)** — wipe local mirror + sign out; server data untouched, re-syncs on next login | ✅ | ☐ | ☐ |
| Reset pushes unsynced sales first (best-effort) + warns if offline | ✅ | ☐ | ☐ |

> **Authority model.** Restore writes to the **local mirror**. The sync *push*
> only carries Sales + Cash-register shifts, so those are the only rows that can
> be made authoritative on the server — restore preserves each row's original
> `syncStatus`, and an admin is prompted after restoring to push the ones still
> `PendingPush` (idempotent by id). Catalogue, customers, suppliers, etc. are
> **server-owned**: they're never pushed and reconcile downward on the next
> pull, so a stale backup can't overwrite server-side records (this is why the
> backend intentionally has no customer update/delete endpoint). `sync_state`
> cursors are never restored (would corrupt sync). Making *all* data
> authoritative from a backup would need new backend bulk-upsert endpoints — a
> deliberate, separate decision.

## 20. Cross-cutting
| Feature | Desktop | Mobile | Web |
|---|---|---|---|
| i18n (French default; English) via string-key dictionaries | ✅ | ☑ | ☐ |
| Currency formatting (free-text currency, not ISO — `amount.toLocaleString() + " " + currency`) | ✅ | ☑ | ☐ |
| Light/dark theme | ✅ | ☑ | ☐ |
| **Crash safety** — error boundary + global async error handlers | ✅ | ☑ (Expo Router `ErrorBoundary` + global handler; type-checked, device-pending) | ☐ |
| **Design foundation** — shared dark-slate palette, 18px card radius, Button ghost/danger, StatCard/StockBadge/Card | ✅ | ☑ (palette unified + component lib; device-pending) | ☐ |
| Custom toast + confirm system | ✅ | ☑ | ☐ |

---

## Release-readiness gaps (all platforms) — NOT yet done
- [ ] **Code signing** — desktop installer is unsigned → SmartScreen warning.
- [ ] **Auto-updater** — no Tauri updater plugin; every fix = manual reinstall.
- [ ] **Automatic/periodic sync + visible sync status** (pending count, offline badge).
- [x] **Local backup** — done on desktop (§19): manual export **and** automatic daily rolling backup (14-day retention) for offline resilience. Remaining: the auto-backup writes to disk only in the installed app (verify on-device); an OS-level scheduled task (runs while the app is closed) is a possible future hardening.
- [ ] **On-device hardware verification** — real thermal printer (ESC/POS auto-detect path only run in `cargo check`), full offline→online sync from the installed app.
- [ ] **CSV/Excel export** of sales & reports (only bulk-stock *import* exists).
- [ ] **Self-service password reset on login** (admin-reset exists).
- [ ] **Tighten CSP** (currently `null` in `tauri.conf.json`).
- [ ] Mobile: re-verify the `?`-marked rows (tax docs, B2B, rewards, PO consolidation, printer changes) against current desktop behaviour.
- [ ] Web client: everything — only the SuperAdmin Blazor shell exists.

## Reference: how to build the desktop installer
```
cd apps/desktop && npm run tauri build
```
Outputs (git-ignored):
- `src-tauri/target/release/bundle/nsis/PharmaStock_<ver>_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/PharmaStock_<ver>_x64_en-US.msi`
