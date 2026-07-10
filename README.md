# PharmaStock

Stock and sales management ecosystem (Desktop, Mobile, Web) for the Cameroon
low-connectivity context. Full specification: see the two companion documents,
`Specification_Book_Stock_Management_Ecosystem.docx` (English) and
`Cahier_des_Charges_Ecosysteme_Gestion_Stock_FR.docx` (French), which this
codebase is built directly against, section by section.

## Stack

- **Backend**: ASP.NET Core Web API (.NET 8) + Entity Framework Core + PostgreSQL
- **Desktop & Mobile**: .NET MAUI (shared C# codebase) — *not yet added, see Roadmap*
- **Web**: Blazor — *not yet added, see Roadmap*

One language, C#, end to end.

## Solution structure

```
PharmaStock.sln
src/
  PharmaStock.Domain/          # POCO entities only, zero dependencies
    Entities/
    Enums/
  PharmaStock.Infrastructure/   # EF Core DbContext + entity configurations
    Data/
  PharmaStock.Api/              # ASP.NET Core minimal API
    Endpoints/
```

### Why this order

`Domain` has no dependencies on anything — it's pure C# classes matching the
spec book's data model (Section 11), plus every entity added in Sections
20-22 (services, loyalty, gift cards, installments, custom fields, devices).
`Infrastructure` depends only on `Domain` and wires those classes into EF
Core. `Api` depends on both and exposes them over HTTP. This direction of
dependency (Api → Infrastructure → Domain, never the reverse) is what lets
the same `Domain` and a chunk of `Infrastructure` be reused unmodified inside
the MAUI apps later, pointed at a local SQLite file instead of PostgreSQL.

## What's implemented so far

- Full domain model: Company, User, Device, Product, ProductPackagingLevel,
  Batch, Supplier, StockMovement, Customer, LoyaltyAccount, GiftCard, Sale,
  SaleLine, PaymentSplit, Service, ServiceStockLink, ServiceLine,
  InstallmentPlan, InstallmentPayment, CustomFieldDefinition, CustomFieldValue
- EF Core DbContext with key constraints (unique company code, unique gift
  card code, unique user phone-per-company, decimal precision, UTC-normalized
  DateTime columns) — Sections 9, 21.3
- `POST /api/companies` — create a company + its first CompanyAdmin account
  in one transaction, returns a JWT (Section 9)
- `POST /api/companies/join` — join an existing company by its unique code (Section 9)
- `POST /api/auth/login` — phone + password → JWT
- `POST /api/companies/{companyId}/users` — CompanyAdmin/SuperAdmin-only, adds staff accounts (Section 3.7)
- `GET /api/companies/{companyId}/products/availability?query=` — Section 17
  Stock Availability Check, including the packaging-hierarchy display logic
  from Section 15 (e.g. "2 boxes + 4 loose capsules")
- `POST /api/companies/{companyId}/sales` — the Sales endpoint (Section 3.1):
  FEFO stock deduction (Section 16.1) via StockMovement rows, packaging-aware
  quantity/pricing (Section 15), mixed product + service lines gated on
  Company.ServicesModuleEnabled (Section 20), service stock-consumption links
  (Section 20.6), split payments (Section 18.1), and Credit sales against
  Customer.CreditBalance (Section 3.5)
- `POST .../products/{productId}/stock/receive` — supplier receiving, always
  a new Batch (Section 3.3/3.4)
- `POST .../products/{productId}/stock/adjust` — manual adjustment with
  mandatory reason, blocked from driving a batch negative (Section 3.3)
- `GET .../products/{productId}/batches` / `GET .../movements` — per-batch
  stock view and full movement history (Section 3.3)

## What's next (see Roadmap)

Desktop MAUI app (offline-first POS, local SQLite, sync engine), then Web
(Blazor) and Mobile (MAUI). Still open on the API side: refresh tokens for
long-lived offline sessions, GiftCard/StoreCredit redemption, held/parked
sales, and the reporting endpoints (Section 14).

## Building this locally

**This code has not been compiled in the environment it was written in** (no
.NET SDK / NuGet access there — see commit message for detail). Before you
trust it, build it yourself:

```bash
# Requires .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
dotnet restore
dotnet build
```

### Running the API

1. Install PostgreSQL locally (or point `ConnectionStrings:Default` in
   `src/PharmaStock.Api/appsettings.json` at a remote instance).
2. Create the initial migration and apply it:
   ```bash
   dotnet tool install --global dotnet-ef   # first time only
   cd src/PharmaStock.Api
   dotnet ef migrations add InitialCreate --project ../PharmaStock.Infrastructure
   dotnet ef database update
   ```
3. Run it:
   ```bash
   dotnet run
   ```
4. Confirm it's alive: `curl http://localhost:5080/health`

## Roadmap (matches the spec book's Section 13 phasing)

- [x] Domain model + DbContext
- [x] Auth (JWT) + password hashing, Company/User seeding
- [x] Sales endpoint: stock deduction via StockMovement, packaging-aware line items
- [x] Stock movement endpoints: entry, adjustment, batch receiving
- [ ] Desktop (.NET MAUI): offline-first POS, local SQLite, sync engine (Section 6)
- [ ] Web (Blazor): admin dashboard, reports, Super Admin multi-client view (Section 22)
- [ ] Mobile (.NET MAUI): stock lookup, barcode scanning, inventory (Section 4)
