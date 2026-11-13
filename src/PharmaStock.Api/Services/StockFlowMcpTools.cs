using System.ComponentModel;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using PharmaStock.Domain.Models;
using PharmaStock.Infrastructure.Data;

namespace PharmaStock.Api.Services;

/// <summary>The Claude connector's tools: READ-ONLY views of the ONE shop the
/// connection was authorized for (the token's company_id). Every tool starts with
/// <see cref="McpAccess.BeginAsync"/> (fresh access check, Restrict* flags, audit log).
/// No tool writes business data. Amounts are in the shop's currency; quantities are in
/// base units (the smallest unit the shop sells, e.g. a tablet or a single item).</summary>
[McpServerToolType]
public class StockFlowMcpTools
{
    private readonly PharmaStockDbContext _db;
    private readonly IHttpContextAccessor _http;

    public StockFlowMcpTools(PharmaStockDbContext db, IHttpContextAccessor http)
    {
        _db = db;
        _http = http;
    }

    [McpServerTool(Name = "shop_info", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Basic facts about the connected StockFlow shop: name, currency, branches (locations), today's date on the server, and who is connected with which role and restrictions. Call this first to learn the currency and branch names.")]
    public async Task<object> ShopInfo()
    {
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "shop_info", null);
        var branches = await _db.Locations
            .Where(l => l.CompanyId == m.CompanyId && l.Active)
            .OrderBy(l => l.Name)
            .Select(l => new { id = l.Id, name = l.Name, address = l.Address })
            .ToListAsync();

        var restrictions = new List<string>();
        if (m.Role != UserRole.CompanyAdmin)
        {
            if (m.RestrictReportsAndFullSales) restrictions.Add("sales reports (sales_summary, top_products)");
            if (m.RestrictCatalog) restrictions.Add("catalog and stock (stock_levels, expiring_batches)");
            if (m.RestrictCustomers) restrictions.Add("customers (customers_with_credit)");
            if (m.RestrictPurchasing) restrictions.Add("purchasing (open_purchase_orders)");
        }

        return new
        {
            shop = m.Company!.Name,
            currency = m.Company.Currency,
            businessType = m.Company.BusinessType,
            todayUtc = Day(DateTime.UtcNow),
            branches,
            connectedAs = new { name = m.User!.Name, role = m.Role == UserRole.CompanyAdmin ? "manager (CompanyAdmin)" : "cashier" },
            unavailableBecauseRestricted = restrictions,
            note = "Read-only connection: Claude can look at this shop's data but cannot change anything.",
        };
    }

    [McpServerTool(Name = "sales_summary", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Sales totals for a date range: revenue, cost of goods sold, gross profit, number of sales, average sale, VAT collected, and a day-by-day breakdown. Only completed sales count (held sales are excluded). Dates are whole days in UTC, both inclusive. Defaults to the last 30 days.")]
    public async Task<object> SalesSummary(
        [Description("First day, format yyyy-MM-dd. Default: 29 days before 'to'.")] string? from = null,
        [Description("Last day (inclusive), format yyyy-MM-dd. Default: today.")] string? to = null,
        [Description("Optional branch id or branch name (see shop_info). Default: all branches.")] string? branch = null)
    {
        var (fromDay, toDay) = Range(from, to);
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "sales_summary",
            $"from={Day(fromDay)} to={Day(toDay)} branch={branch}", x => x.RestrictReportsAndFullSales);
        var location = await ResolveBranchAsync(m.CompanyId, branch);

        var s = await ReportQueries.SalesSummaryAsync(_db, m.CompanyId, location?.Id, fromDay, toDay);
        return new
        {
            currency = m.Company!.Currency,
            from = Day(fromDay),
            to = Day(toDay),
            branch = location?.Name ?? "all branches",
            totalRevenue = s.TotalRevenue,
            totalCost = s.TotalCost,
            grossProfit = s.TotalProfit,
            salesCount = s.TotalSalesCount,
            averageSale = Math.Round(s.AverageSaleValue, 2),
            vatCollected = Math.Round(s.TotalTax, 2),
            daily = s.DailyBreakdown.Select(d => new { date = Day(d.Date), revenue = d.Revenue, sales = d.SalesCount }),
        };
    }

    [McpServerTool(Name = "top_products", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Best-selling products for a date range, ranked by revenue, with quantity sold (base units), revenue and gross profit. Only completed sales count. Defaults to the last 30 days and the top 10.")]
    public async Task<object> TopProducts(
        [Description("First day, format yyyy-MM-dd. Default: 29 days before 'to'.")] string? from = null,
        [Description("Last day (inclusive), format yyyy-MM-dd. Default: today.")] string? to = null,
        [Description("How many products to return, 1 to 50. Default 10.")] int limit = 10,
        [Description("Optional branch id or branch name (see shop_info). Default: all branches.")] string? branch = null)
    {
        var (fromDay, toDay) = Range(from, to);
        limit = Math.Clamp(limit, 1, 50);
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "top_products",
            $"from={Day(fromDay)} to={Day(toDay)} limit={limit} branch={branch}", x => x.RestrictReportsAndFullSales);
        var location = await ResolveBranchAsync(m.CompanyId, branch);

        var items = await ReportQueries.TopProductsAsync(_db, m.CompanyId, location?.Id, fromDay, toDay, limit);
        return new
        {
            currency = m.Company!.Currency,
            from = Day(fromDay),
            to = Day(toDay),
            branch = location?.Name ?? "all branches",
            products = items.Select((p, i) => new
            {
                rank = i + 1,
                product = p.ProductName,
                quantitySold = p.QuantitySold,
                revenue = p.Revenue,
                grossProfit = p.Profit,
            }),
        };
    }

    [McpServerTool(Name = "stock_levels", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Current stock per product (base units) with its low-stock threshold and status: 'out of stock', 'low' (at or below the threshold) or 'ok'. Use onlyLowOrOut=true for a reorder list. Searching matches the product name or barcode.")]
    public async Task<object> StockLevels(
        [Description("Optional text to search in product name or barcode.")] string? search = null,
        [Description("true: only products that are out of stock or at/below their low-stock threshold.")] bool onlyLowOrOut = false,
        [Description("Optional branch id or branch name (see shop_info). Default: all branches combined.")] string? branch = null,
        [Description("Maximum products to return, 1 to 200. Default 50.")] int limit = 50)
    {
        limit = Math.Clamp(limit, 1, 200);
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "stock_levels",
            $"search={search} onlyLowOrOut={onlyLowOrOut} branch={branch} limit={limit}", x => x.RestrictCatalog);
        var location = await ResolveBranchAsync(m.CompanyId, branch);
        var locationId = location?.Id;

        // Variant-parent headers hold no stock of their own (same exclusion as the alerts).
        var query = _db.Products.Where(p => p.CompanyId == m.CompanyId && p.IsActive && !p.HasVariants);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p => EF.Functions.ILike(p.Name, $"%{search}%") || (p.Barcode != null && p.Barcode == search));

        var rows = await query
            .Select(p => new
            {
                p.Name,
                p.Barcode,
                p.SalePrice,
                p.LowStockThreshold,
                Stock = p.Batches.Where(b => locationId == null || b.LocationId == locationId)
                    .Sum(b => (int?)b.QuantityInBaseUnits) ?? 0,
            })
            .ToListAsync();

        static string Status(int stock, int threshold) =>
            stock <= 0 ? "out of stock" : threshold > 0 && stock <= threshold ? "low" : "ok";

        var all = rows.Select(r => new
        {
            product = r.Name,
            barcode = r.Barcode,
            stock = r.Stock,
            lowStockThreshold = r.LowStockThreshold,
            status = Status(r.Stock, r.LowStockThreshold),
            salePrice = r.SalePrice,
        }).ToList();

        var filtered = onlyLowOrOut
            ? all.Where(r => r.status != "ok").OrderBy(r => r.stock).ThenBy(r => r.product).ToList()
            : all.OrderBy(r => r.product).ToList();

        return new
        {
            currency = m.Company!.Currency,
            branch = location?.Name ?? "all branches",
            productsMatched = filtered.Count,
            outOfStockCount = all.Count(r => r.status == "out of stock"),
            lowCount = all.Count(r => r.status == "low"),
            returned = Math.Min(limit, filtered.Count),
            products = filtered.Take(limit),
        };
    }

    [McpServerTool(Name = "expiring_batches", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Stock batches that expire soon (within N days) and, by default, batches already expired that still hold stock. Gives product, batch number, branch, expiry date, days left (negative = already expired), quantity and its value at purchase cost.")]
    public async Task<object> ExpiringBatches(
        [Description("Look ahead this many days, 1 to 365. Default 30.")] int withinDays = 30,
        [Description("Also list batches already expired that still have stock. Default true.")] bool includeExpired = true,
        [Description("Optional branch id or branch name (see shop_info). Default: all branches.")] string? branch = null)
    {
        withinDays = Math.Clamp(withinDays, 1, 365);
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "expiring_batches",
            $"withinDays={withinDays} includeExpired={includeExpired} branch={branch}", x => x.RestrictCatalog);
        var location = await ResolveBranchAsync(m.CompanyId, branch);

        var today = DateTime.UtcNow.Date;
        var cutoff = today.AddDays(withinDays + 1);
        var query = _db.Batches.Where(b => b.Product!.CompanyId == m.CompanyId && b.Product.IsActive
            && b.QuantityInBaseUnits > 0 && b.ExpiryDate != null && b.ExpiryDate < cutoff);
        if (!includeExpired) query = query.Where(b => b.ExpiryDate >= today);
        if (location is not null) query = query.Where(b => b.LocationId == location.Id);

        var batches = await query
            .OrderBy(b => b.ExpiryDate)
            .Select(b => new
            {
                Product = b.Product!.Name,
                b.BatchNumber,
                Branch = b.Location!.Name,
                Expiry = b.ExpiryDate!.Value,
                b.QuantityInBaseUnits,
                b.PurchasePricePerBaseUnit,
            })
            .Take(500)
            .ToListAsync();

        var items = batches.Select(b => new
        {
            product = b.Product,
            batch = b.BatchNumber,
            branch = b.Branch,
            expiryDate = Day(b.Expiry),
            daysLeft = (int)(b.Expiry.Date - today).TotalDays,
            quantity = b.QuantityInBaseUnits,
            valueAtCost = b.QuantityInBaseUnits * b.PurchasePricePerBaseUnit,
        }).ToList();

        return new
        {
            currency = m.Company!.Currency,
            todayUtc = Day(today),
            expiryTrackingEnabled = m.Company.ExpiryTrackingEnabled,
            expiredCount = items.Count(i => i.daysLeft < 0),
            expiringSoonCount = items.Count(i => i.daysLeft >= 0),
            totalValueAtCost = items.Sum(i => i.valueAtCost),
            batches = items,
        };
    }

    [McpServerTool(Name = "customers_with_credit", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Customers who owe the shop money (credit sales not yet paid), largest balance first, with the total owed. This is customer DEBT to the shop, not store credit or gift cards.")]
    public async Task<object> CustomersWithCredit(
        [Description("Maximum customers to return, 1 to 200. Default 50.")] int limit = 50)
    {
        limit = Math.Clamp(limit, 1, 200);
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "customers_with_credit",
            $"limit={limit}", x => x.RestrictCustomers);

        var query = _db.Customers.Where(c => c.CompanyId == m.CompanyId && c.CreditBalance > 0);
        var total = await query.SumAsync(c => (decimal?)c.CreditBalance) ?? 0;
        var count = await query.CountAsync();
        var customers = await query
            .OrderByDescending(c => c.CreditBalance)
            .Take(limit)
            .Select(c => new { name = c.Name, phone = c.Phone, owes = c.CreditBalance, isBusiness = c.IsBusiness })
            .ToListAsync();

        return new
        {
            currency = m.Company!.Currency,
            customersOwing = count,
            totalOwed = total,
            customers,
        };
    }

    [McpServerTool(Name = "open_purchase_orders", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Supplier purchase orders still open (status 'pending' or 'partially received'), newest first, with supplier, branch, each line's ordered and received quantities (base units), and the value still to receive.")]
    public async Task<object> OpenPurchaseOrders(
        [Description("Optional branch id or branch name (see shop_info). Default: all branches.")] string? branch = null)
    {
        var m = await McpAccess.BeginAsync(_http.HttpContext, _db, "open_purchase_orders",
            $"branch={branch}", x => x.RestrictPurchasing);
        var location = await ResolveBranchAsync(m.CompanyId, branch);

        var query = _db.PurchaseOrders.Where(o => o.CompanyId == m.CompanyId
            && (o.Status == PurchaseOrderStatus.Pending || o.Status == PurchaseOrderStatus.PartiallyReceived));
        if (location is not null) query = query.Where(o => o.LocationId == location.Id);

        var orders = await query
            .OrderByDescending(o => o.CreatedAt)
            .Take(100)
            .Select(o => new
            {
                o.CreatedAt,
                Supplier = o.Supplier!.Name,
                Branch = o.Location!.Name,
                o.Status,
                o.Notes,
                Lines = o.Lines.Select(l => new
                {
                    Product = l.Product!.Name,
                    l.QuantityOrderedInBaseUnits,
                    l.QuantityReceivedInBaseUnits,
                    l.UnitCost,
                }).ToList(),
            })
            .ToListAsync();

        return new
        {
            currency = m.Company!.Currency,
            openOrders = orders.Count,
            orders = orders.Select(o => new
            {
                created = Day(o.CreatedAt),
                supplier = o.Supplier,
                branch = o.Branch,
                status = o.Status == PurchaseOrderStatus.Pending ? "pending" : "partially received",
                notes = o.Notes,
                orderedValue = o.Lines.Sum(l => l.QuantityOrderedInBaseUnits * l.UnitCost),
                valueStillToReceive = o.Lines.Sum(l =>
                    Math.Max(0, l.QuantityOrderedInBaseUnits - l.QuantityReceivedInBaseUnits) * l.UnitCost),
                lines = o.Lines.Select(l => new
                {
                    product = l.Product,
                    ordered = l.QuantityOrderedInBaseUnits,
                    received = l.QuantityReceivedInBaseUnits,
                    unitCost = l.UnitCost,
                }),
            }),
        };
    }

    /// <summary>A branch of THIS shop by id or (case-insensitive) name; null when not given.</summary>
    private async Task<Location?> ResolveBranchAsync(Guid companyId, string? branch)
    {
        if (string.IsNullOrWhiteSpace(branch)) return null;
        var branches = await _db.Locations.AsNoTracking().Where(l => l.CompanyId == companyId).ToListAsync();
        var match = Guid.TryParse(branch, out var id)
            ? branches.FirstOrDefault(l => l.Id == id)
            : branches.FirstOrDefault(l => string.Equals(l.Name.Trim(), branch.Trim(), StringComparison.OrdinalIgnoreCase));
        return match ?? throw new McpException(
            $"Unknown branch '{branch}'. Branches of this shop: {string.Join(", ", branches.Where(b => b.Active).Select(b => b.Name))}.");
    }

    private static (DateTime From, DateTime To) Range(string? from, string? to)
    {
        var toDay = ParseDay(to, "to") ?? DateTime.UtcNow.Date;
        var fromDay = ParseDay(from, "from") ?? toDay.AddDays(-29);
        if (fromDay > toDay)
            throw new McpException("'from' must be on or before 'to'.");
        if ((toDay - fromDay).TotalDays > 366 * 3)
            throw new McpException("Please ask for at most 3 years at a time.");
        return (fromDay, toDay);
    }

    private static DateTime? ParseDay(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateTime.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var d))
            return DateTime.SpecifyKind(d.Date, DateTimeKind.Utc);
        throw new McpException($"'{name}' must be a date like 2026-11-13.");
    }

    private static string Day(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
