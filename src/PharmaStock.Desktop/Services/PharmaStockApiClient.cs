using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PharmaStock.Domain.Models;
// MAUI's own Microsoft.Maui.Devices.DevicePlatform (Android/iOS/WinUI/...) is
// brought in by an implicit global using and collides by name with our own
// Domain enum (Desktop/Mobile/Web) — alias ours explicitly rather than fully
// qualifying it at every call site.
using DevicePlatform = PharmaStock.Domain.Models.DevicePlatform;

namespace PharmaStock.Desktop.Services;

public record CreateCompanyRequest(
    string Name, string? Description, string Currency,
    string AdminName, string AdminPhone, string AdminPassword,
    Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record JoinCompanyRequest(string UniqueCode);
public record LoginRequest(string Phone, string Password, Guid DeviceId, string DeviceName, DevicePlatform Platform);
public record RefreshRequest(Guid DeviceId, string RefreshToken);

public record CompanyResponse(
    Guid Id, string Name, string UniqueCode, string Currency, bool ServicesModuleEnabled, string? Description, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue);
public record UpdateCompanyRequest(
    string Name, string? Description, string Currency, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue);
public record UserResponse(Guid Id, string Name, string Phone, UserRole Role, bool Active);
public record LocationResponse(Guid Id, string Name, string? Address, bool Active);
public record AuthResponse(string Token, DateTime ExpiresAt, string RefreshToken, Guid DeviceId, UserResponse User, Guid? CompanyId);
public record CreateCompanyResponse(CompanyResponse Company, AuthResponse Admin, LocationResponse DefaultLocation);

// Mirrors PharmaStock.Api.Services.ProductEndpoints
public record PackagingLevelInfo(Guid Id, string UnitName, int QuantityInBaseUnits, decimal UnitPrice);
public record ProductSearchResult(
    Guid ProductId, string Name, string? Barcode, decimal SalePrice,
    string StockStatus, IEnumerable<PackagingLevelInfo> PackagingLevels);
public record StockAvailabilityResponse(
    Guid ProductId, string Name, string? Barcode, decimal SalePrice, int TotalBaseUnitsAvailable,
    string DisplayQuantity, string StockStatus, DateTime? EarliestExpiry,
    IEnumerable<PackagingLevelInfo> PackagingLevels);

// Mirrors PharmaStock.Api.Services.ProductEndpoints — catalog management
public record PackagingLevelRequest(string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);
public record ProductRequest(
    string Name, string? Barcode, Guid? CategoryId, Guid? SupplierId,
    decimal PurchasePrice, decimal SalePrice, int LowStockThreshold,
    decimal? TaxRateOverridePercent, bool IsFavorite,
    List<PackagingLevelRequest>? PackagingLevels);
public record PackagingLevelDetail(Guid Id, string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);
public record ProductDetailResponse(
    Guid Id, string Name, string? Barcode, Guid? CategoryId, string? CategoryName, Guid? SupplierId, string? SupplierName,
    decimal PurchasePrice, decimal SalePrice, bool IsFavorite, bool IsActive, int LowStockThreshold,
    decimal? TaxRateOverridePercent, List<PackagingLevelDetail> PackagingLevels);
public record RestockSuggestionItem(Guid ProductId, string Name, int CurrentStock, int LowStockThreshold, int SuggestedQuantity, decimal EstimatedUnitCost);
public record ProductCatalogItem(Guid Id, string Name, string? Barcode, string? CategoryName, decimal SalePrice, bool IsFavorite, bool IsActive, string StockStatus, DateTime? EarliestExpiry);
public record ProductCatalogPageResponse(List<ProductCatalogItem> Items, bool HasMore);

// Backs the filter panel on ProductCatalogPage. StockStatuses is a subset of
// "in_stock"/"low_stock"/"out_of_stock" — null/empty means no stock filter.
public record ProductCatalogFilter(
    List<string>? StockStatuses = null,
    bool FavoritesOnly = false,
    bool ExpiringSoonOnly = false,
    bool ExpiredOnly = false,
    bool ArchivedOnly = false)
{
    public static readonly ProductCatalogFilter None = new();
    public bool IsActive => (StockStatuses is { Count: > 0 }) || FavoritesOnly || ExpiringSoonOnly || ExpiredOnly || ArchivedOnly;
}

// Mirrors PharmaStock.Api.Services.CategoryEndpoints
public record CategoryRequest(string Name);
public record CategoryResponse(Guid Id, string Name);

// Mirrors PharmaStock.Api.Services.DashboardEndpoints
public record RecentSaleLineItem(string Name, int Quantity, string UnitLabel);
public record RecentSaleItem(Guid Id, decimal Total, PaymentMethod PaymentMethod, DateTime Timestamp, List<RecentSaleLineItem> Items);
public record DashboardSummaryResponse(
    decimal TodayRevenue, int TodaySalesCount,
    int TotalProducts, int LowStockCount, int OutOfStockCount,
    int ExpiringSoonCount, int ExpiredCount, int ArchivedProductsCount,
    List<RecentSaleItem> RecentSales,
    int NegativeStockBatchCount, int AutoClosedShiftConflictCount);

// Mirrors PharmaStock.Api.Services.StockMovementEndpoints
public record ReceiveStockRequest(
    Guid LocationId, string BatchNumber, DateTime? ExpiryDate,
    int QuantityInBaseUnits, decimal? PurchasePricePerBaseUnit);
public record AdjustStockRequest(Guid BatchId, int DeltaInBaseUnits, string Reason);
public record BatchResponse(
    Guid Id, Guid LocationId, string BatchNumber, DateTime? ExpiryDate,
    int QuantityInBaseUnits, decimal PurchasePricePerBaseUnit, DateTime ReceivedAt);

// Mirrors PharmaStock.Api.Services.SaleEndpoints
public record SaleLineRequest(Guid ProductId, int Quantity, Guid? PackagingLevelId);
public record PaymentSplitRequest(PaymentMethod Method, decimal Amount);
public record CreateSaleRequest(
    Guid LocationId, Guid? CustomerId, PaymentMethod PaymentMethod,
    List<SaleLineRequest>? ProductLines, List<object>? ServiceLines, List<PaymentSplitRequest>? PaymentSplits,
    decimal? AmountTendered = null, string? GiftCardCode = null);
public record SaleLineResponse(
    Guid ProductId, string ProductName, Guid? BatchId, string? BatchNumber,
    int QuantityInBaseUnits, Guid? PackagingLevelId, string? PackagingLevelName, int UnitsPerPackagingLevel, decimal UnitPrice,
    decimal TaxRatePercent, decimal LineTotal);
public record PaymentSplitResponse(PaymentMethod Method, decimal Amount);
public record SaleResponse(
    Guid Id, decimal Total, PaymentMethod PaymentMethod, SaleStatus Status, DateTime Timestamp,
    IEnumerable<SaleLineResponse> ProductLines, IEnumerable<object> ServiceLines, IEnumerable<PaymentSplitResponse> PaymentSplits,
    decimal? AmountTendered, decimal? ChangeDue);

public record SaleSummaryResponse(Guid Id, DateTime Timestamp, decimal Total, PaymentMethod PaymentMethod, string CashierName, int ItemCount);
public record SaleHistoryPageResponse(List<SaleSummaryResponse> Items, bool HasMore);
public record SaleDetailResponse(
    Guid Id, decimal Total, PaymentMethod PaymentMethod, SaleStatus Status, DateTime Timestamp,
    string CashierName, string LocationName,
    IEnumerable<SaleLineResponse> ProductLines, IEnumerable<object> ServiceLines, IEnumerable<PaymentSplitResponse> PaymentSplits,
    decimal? AmountTendered, decimal? ChangeDue);

// Held (parked) sales — Section 18.1
public record HoldSaleRequest(Guid LocationId, Guid? CustomerId, List<SaleLineRequest> ProductLines);
public record HeldSaleSummaryResponse(Guid Id, DateTime Timestamp, decimal Total, string CashierName, string LocationName, int ItemCount);

// Mirrors PharmaStock.Api.Services.ReportingEndpoints — Section 14
public record DailySalesItem(DateTime Date, decimal Revenue, int SalesCount);
public record SalesSummaryResponse(
    decimal TotalRevenue, decimal TotalCost, decimal TotalProfit,
    int TotalSalesCount, decimal AverageSaleValue,
    List<DailySalesItem> DailyBreakdown);
public record TopProductItem(Guid ProductId, string ProductName, int QuantitySold, decimal Revenue, decimal Profit);

// Mirrors PharmaStock.Api.Services.SupplierEndpoints — Section 3.4
public record SupplierRequest(string Name, string? ContactPhone, string? ContactEmail);
public record SupplierResponse(Guid Id, string Name, string? ContactPhone, string? ContactEmail);

// Mirrors PharmaStock.Api.Services.CustomerEndpoints — Section 3.5/21.3
public record CustomerRequest(string Name, string? Phone);
public record CustomerResponse(Guid Id, string Name, string? Phone, decimal CreditBalance, int LoyaltyPointsBalance, decimal LoyaltyStoreCreditBalance);

// Mirrors PharmaStock.Api.Services.GiftCardEndpoints — Section 21.3
public record IssueGiftCardRequest(decimal InitialValue);
public record GiftCardResponse(Guid Id, string Code, decimal InitialValue, decimal RemainingValue, bool Active, DateTime CreatedAt);
public record SetGiftCardActiveRequest(bool Active);

// Mirrors PharmaStock.Api.Services.LoyaltyEndpoints — Section 21.3
public record RedeemLoyaltyPointsRequest(int Points);
public record LoyaltyAccountResponse(int PointsBalance, decimal StoreCreditBalance);

// Mirrors PharmaStock.Api.Services.PurchaseOrderEndpoints — Section 3.4
public record PurchaseOrderLineRequest(Guid ProductId, int QuantityOrdered, decimal UnitCost);
public record CreatePurchaseOrderRequest(Guid LocationId, Guid SupplierId, string? Notes, List<PurchaseOrderLineRequest> Lines);
public record ReceivePurchaseOrderLineRequest(int QuantityReceivedNow, string BatchNumber, DateTime? ExpiryDate, decimal? ActualUnitCost);
public record PurchaseOrderLineResponse(Guid Id, Guid ProductId, string ProductName, int QuantityOrdered, int QuantityReceived, decimal UnitCost);
public record PurchaseOrderSummaryResponse(Guid Id, DateTime CreatedAt, string SupplierName, string LocationName, PurchaseOrderStatus Status, int LineCount, decimal TotalCost);
public record PurchaseOrderDetailResponse(Guid Id, DateTime CreatedAt, string SupplierName, string LocationName, PurchaseOrderStatus Status, string? Notes, List<PurchaseOrderLineResponse> Lines);

// Mirrors PharmaStock.Api.Services.ShiftEndpoints
public record OpenShiftRequest(decimal OpeningCashAmount);
public record CloseShiftRequest(decimal ClosingCashAmount, string? ClosingNotes);
public record ShiftSummaryResponse(
    Guid Id, Guid LocationId, string LocationName, string OpenedByName, string? ClosedByName,
    ShiftStatus Status, DateTime OpenedAt, DateTime? ClosedAt,
    decimal OpeningCashAmount, decimal? ClosingCashAmount, decimal? ExpectedCashAmount, decimal? Discrepancy);
public record ShiftHistoryPageResponse(List<ShiftSummaryResponse> Items, bool HasMore);
public record PaymentMethodTotal(PaymentMethod Method, decimal Total);
public record ShiftDetailResponse(
    Guid Id, Guid LocationId, string LocationName, string OpenedByName, string? ClosedByName,
    ShiftStatus Status, DateTime OpenedAt, DateTime? ClosedAt,
    decimal OpeningCashAmount, decimal? ClosingCashAmount, decimal? ExpectedCashAmount, decimal? Discrepancy, string? ClosingNotes,
    int SalesCount, decimal TotalSales, List<PaymentMethodTotal> PaymentBreakdown);

// Mirrors PharmaStock.Api.Services.SyncEndpoints — Section 6
public record SyncPushSaleLine(Guid Id, Guid ProductId, Guid? BatchId, int QuantityInBaseUnits, Guid? PackagingLevelId, decimal UnitPrice, decimal TaxRatePercent);
public record SyncPushPaymentSplit(Guid Id, PaymentMethod Method, decimal Amount);
public record SyncPushStockMovement(Guid Id, Guid ProductId, Guid? BatchId, Guid LocationId, Guid? DestinationLocationId, StockMovementType Type, int QuantityInBaseUnits, string? Reason, Guid UserId, DateTime Timestamp);
public record SyncPushSale(
    Guid Id, Guid LocationId, Guid UserId, Guid? CustomerId, Guid? ShiftId,
    decimal Total, PaymentMethod PaymentMethod, SaleStatus Status,
    decimal? AmountTendered, decimal? ChangeDue, DateTime Timestamp,
    List<SyncPushSaleLine> ProductLines, List<object> ServiceLines,
    List<SyncPushPaymentSplit> PaymentSplits, List<SyncPushStockMovement> StockMovements,
    string? GiftCardCode = null);
public record SyncPushShiftOpen(Guid Id, Guid LocationId, Guid OpenedByUserId, decimal OpeningCashAmount, DateTime OpenedAt);
public record SyncPushShiftClose(Guid ShiftId, Guid ClosedByUserId, decimal ClosingCashAmount, string? ClosingNotes, DateTime ClosedAt);
public record SyncPushRequest(Guid DeviceId, List<SyncPushSale> Sales, List<SyncPushShiftOpen> ShiftOpens, List<SyncPushShiftClose> ShiftCloses);
public record SyncPushResult(Guid Id, bool Applied, string? SkippedReason);
public record SyncPushResponse(List<SyncPushResult> SaleResults, List<SyncPushResult> ShiftOpenResults, List<SyncPushResult> ShiftCloseResults, DateTime ServerTimestamp);

public record SyncPullPackagingLevel(Guid Id, Guid ProductId, string UnitName, int QuantityInBaseUnits, decimal? SalePriceOverride);
public record SyncPullProduct(Guid Id, string Name, string? Barcode, Guid? CategoryId, decimal PurchasePrice, decimal SalePrice, Guid? SupplierId, bool IsFavorite, bool IsActive, int LowStockThreshold, decimal? TaxRateOverridePercent, DateTime UpdatedAt, List<SyncPullPackagingLevel> PackagingLevels);
public record SyncPullCategory(Guid Id, string Name, DateTime UpdatedAt);
public record SyncPullCustomer(Guid Id, string Name, string? Phone, decimal CreditBalance, int LoyaltyPointsBalance, decimal LoyaltyStoreCreditBalance, DateTime UpdatedAt);
public record SyncPullSupplier(Guid Id, string Name, string? ContactPhone, string? ContactEmail, DateTime UpdatedAt);
public record SyncPullBatch(Guid Id, Guid ProductId, Guid LocationId, string BatchNumber, DateTime? ExpiryDate, int QuantityInBaseUnits, decimal PurchasePricePerBaseUnit, DateTime UpdatedAt);
public record SyncPullLocation(Guid Id, string Name, string? Address, bool Active);
public record SyncPullCompanyInfo(
    Guid Id, string Name, string UniqueCode, string Currency, decimal DefaultTaxRatePercent,
    bool LoyaltyEnabled, decimal LoyaltyEarnRateAmount, decimal LoyaltyPointValue);
public record SyncPullGiftCard(Guid Id, string Code, decimal InitialValue, decimal RemainingValue, bool Active);
public record SyncPullStockMovement(Guid Id, Guid ProductId, Guid? BatchId, Guid LocationId, Guid? DestinationLocationId, StockMovementType Type, int QuantityInBaseUnits, string? Reason, Guid UserId, DateTime Timestamp);
public record SyncPullUser(Guid Id, string Name, string Phone);
public record SyncPullResponse(
    DateTime ServerTimestamp, SyncPullCompanyInfo Company, List<SyncPullLocation> Locations,
    List<SyncPullProduct> Products, List<SyncPullCategory> Categories,
    List<SyncPullCustomer> Customers, List<SyncPullSupplier> Suppliers,
    List<SyncPullBatch> Batches, List<SyncPullStockMovement> StockMovements,
    List<SyncPullUser> Users, List<SyncPullGiftCard> GiftCards);

public class PharmaStockApiException : Exception
{
    public int StatusCode { get; }
    public PharmaStockApiException(int statusCode, string message) : base(message) => StatusCode = statusCode;
}

/// <summary>Thin wrapper over the PharmaStock.Api endpoints already built and
/// smoke-tested server-side (see the Api project's Services/*.cs). Talks to
/// the API over plain HTTP for now — this is the "online" path only; the
/// offline-first local SQLite store and sync queue (Section 6) are a
/// separate piece of work once these first screens are up and working.</summary>
public class PharmaStockApiClient
{
    private readonly HttpClient _http;
    private readonly SessionService _session;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public PharmaStockApiClient(HttpClient http, SessionService session)
    {
        _http = http;
        _session = session;
    }

    // allowRefresh: false on both — a 401 here means "wrong password"/an
    // unrelated failure, not "this call's JWT expired" (neither call even
    // sends one), so it must never trigger a refresh-and-retry.
    public Task<CreateCompanyResponse> CreateCompanyAsync(CreateCompanyRequest request, CancellationToken ct = default)
        => PostAsync<CreateCompanyRequest, CreateCompanyResponse>("/api/companies", request, ct, allowRefresh: false);

    public Task<CompanyResponse> JoinCompanyAsync(string uniqueCode, CancellationToken ct = default)
        => PostAsync<JoinCompanyRequest, CompanyResponse>("/api/companies/join", new JoinCompanyRequest(uniqueCode), ct);

    public Task<AuthResponse> LoginAsync(string phone, string password, Guid deviceId, string deviceName, DevicePlatform platform, CancellationToken ct = default)
        => PostAsync<LoginRequest, AuthResponse>("/api/auth/login", new LoginRequest(phone, password, deviceId, deviceName, platform), ct, allowRefresh: false);

    // Exchanges the session's stored refresh token for a new JWT (Section
    // 21.1) — allowRefresh: false on the underlying send, since a 401 here
    // means the refresh token itself is dead and must not trigger another
    // refresh attempt against itself.
    public Task<AuthResponse> RefreshSessionAsync(CancellationToken ct = default)
    {
        if (_session.RefreshToken is not { Length: > 0 } refreshToken)
            throw new PharmaStockApiException(401, "Session expirée. Veuillez vous reconnecter.");

        return SendAsync<AuthResponse>(() => new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh")
        {
            Content = JsonContent.Create(new RefreshRequest(_session.DeviceId, refreshToken), options: JsonOptions)
        }, ct, allowRefresh: false);
    }

    public Task<CompanyResponse> GetCompanyAsync(Guid companyId, CancellationToken ct = default)
        => GetAsync<CompanyResponse>($"/api/companies/{companyId}", ct);

    public Task<CompanyResponse> UpdateCompanyAsync(Guid companyId, UpdateCompanyRequest request, CancellationToken ct = default)
        => PutAsync<UpdateCompanyRequest, CompanyResponse>($"/api/companies/{companyId}", request, ct);

    public Task<List<LocationResponse>> GetLocationsAsync(Guid companyId, CancellationToken ct = default)
        => GetAsync<List<LocationResponse>>($"/api/companies/{companyId}/locations", ct);

    public Task<List<ProductSearchResult>> SearchProductsAsync(Guid companyId, string search, CancellationToken ct = default)
        => GetAsync<List<ProductSearchResult>>(
            $"/api/companies/{companyId}/products?search={Uri.EscapeDataString(search)}", ct);

    public Task<StockAvailabilityResponse> GetProductAvailabilityAsync(Guid companyId, string query, CancellationToken ct = default)
        => GetAsync<StockAvailabilityResponse>(
            $"/api/companies/{companyId}/products/availability?query={Uri.EscapeDataString(query)}", ct);

    public Task<List<RestockSuggestionItem>> GetRestockSuggestionsAsync(Guid companyId, Guid supplierId, Guid locationId, CancellationToken ct = default)
        => GetAsync<List<RestockSuggestionItem>>(
            $"/api/companies/{companyId}/products/restock-suggestions?supplierId={supplierId}&locationId={locationId}", ct);

    public Task<SaleResponse> CreateSaleAsync(Guid companyId, CreateSaleRequest request, CancellationToken ct = default)
        => PostAsync<CreateSaleRequest, SaleResponse>($"/api/companies/{companyId}/sales", request, ct);

    public Task<SaleHistoryPageResponse> GetSalesHistoryAsync(Guid companyId, int page, DateTime? from = null, DateTime? to = null, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/sales?page={page}";
        if (from is not null) url += $"&from={from.Value:yyyy-MM-dd}";
        if (to is not null) url += $"&to={to.Value:yyyy-MM-dd}";
        return GetAsync<SaleHistoryPageResponse>(url, ct);
    }

    public Task<SaleDetailResponse> GetSaleDetailAsync(Guid companyId, Guid saleId, CancellationToken ct = default)
        => GetAsync<SaleDetailResponse>($"/api/companies/{companyId}/sales/{saleId}", ct);

    public Task<SaleResponse> HoldSaleAsync(Guid companyId, HoldSaleRequest request, CancellationToken ct = default)
        => PostAsync<HoldSaleRequest, SaleResponse>($"/api/companies/{companyId}/sales/hold", request, ct);

    public Task<List<HeldSaleSummaryResponse>> GetHeldSalesAsync(Guid companyId, Guid? locationId = null, DateTime? from = null, DateTime? to = null, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/sales/held";
        var query = new List<string>();
        if (locationId is not null) query.Add($"locationId={locationId}");
        if (from is not null) query.Add($"from={from.Value:yyyy-MM-dd}");
        if (to is not null) query.Add($"to={to.Value:yyyy-MM-dd}");
        if (query.Count > 0) url += "?" + string.Join("&", query);
        return GetAsync<List<HeldSaleSummaryResponse>>(url, ct);
    }

    public Task DeleteHeldSaleAsync(Guid companyId, Guid saleId, CancellationToken ct = default)
        => DeleteAsync($"/api/companies/{companyId}/sales/{saleId}", ct);

    public Task<SalesSummaryResponse> GetSalesSummaryAsync(Guid companyId, Guid? locationId = null, DateTime? from = null, DateTime? to = null, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/reports/sales-summary";
        var query = new List<string>();
        if (locationId is not null) query.Add($"locationId={locationId}");
        if (from is not null) query.Add($"from={from.Value:yyyy-MM-dd}");
        if (to is not null) query.Add($"to={to.Value:yyyy-MM-dd}");
        if (query.Count > 0) url += "?" + string.Join("&", query);
        return GetAsync<SalesSummaryResponse>(url, ct);
    }

    public Task<List<TopProductItem>> GetTopProductsAsync(Guid companyId, Guid? locationId = null, DateTime? from = null, DateTime? to = null, int limit = 20, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/reports/top-products?limit={limit}";
        if (locationId is not null) url += $"&locationId={locationId}";
        if (from is not null) url += $"&from={from.Value:yyyy-MM-dd}";
        if (to is not null) url += $"&to={to.Value:yyyy-MM-dd}";
        return GetAsync<List<TopProductItem>>(url, ct);
    }

    public Task<List<SupplierResponse>> GetSuppliersAsync(Guid companyId, string? search = null, CancellationToken ct = default)
        => GetAsync<List<SupplierResponse>>(
            $"/api/companies/{companyId}/suppliers" +
            (string.IsNullOrWhiteSpace(search) ? "" : $"?search={Uri.EscapeDataString(search)}"), ct);

    public Task<SupplierResponse> CreateSupplierAsync(Guid companyId, string name, string? contactPhone = null, string? contactEmail = null, CancellationToken ct = default)
        => PostAsync<SupplierRequest, SupplierResponse>($"/api/companies/{companyId}/suppliers", new SupplierRequest(name, contactPhone, contactEmail), ct);

    public Task<SupplierResponse> UpdateSupplierAsync(Guid companyId, Guid supplierId, string name, string? contactPhone, string? contactEmail, CancellationToken ct = default)
        => PutAsync<SupplierRequest, SupplierResponse>($"/api/companies/{companyId}/suppliers/{supplierId}", new SupplierRequest(name, contactPhone, contactEmail), ct);

    public Task DeleteSupplierAsync(Guid companyId, Guid supplierId, CancellationToken ct = default)
        => DeleteAsync($"/api/companies/{companyId}/suppliers/{supplierId}", ct);

    public Task<List<CustomerResponse>> GetCustomersAsync(Guid companyId, string? search = null, CancellationToken ct = default)
        => GetAsync<List<CustomerResponse>>(
            $"/api/companies/{companyId}/customers" +
            (string.IsNullOrWhiteSpace(search) ? "" : $"?search={Uri.EscapeDataString(search)}"), ct);

    public Task<CustomerResponse> CreateCustomerAsync(Guid companyId, string name, string? phone, CancellationToken ct = default)
        => PostAsync<CustomerRequest, CustomerResponse>($"/api/companies/{companyId}/customers", new CustomerRequest(name, phone), ct);

    public Task<List<GiftCardResponse>> GetGiftCardsAsync(Guid companyId, string? search = null, CancellationToken ct = default)
        => GetAsync<List<GiftCardResponse>>(
            $"/api/companies/{companyId}/giftcards" +
            (string.IsNullOrWhiteSpace(search) ? "" : $"?search={Uri.EscapeDataString(search)}"), ct);

    public Task<GiftCardResponse> IssueGiftCardAsync(Guid companyId, decimal initialValue, CancellationToken ct = default)
        => PostAsync<IssueGiftCardRequest, GiftCardResponse>($"/api/companies/{companyId}/giftcards", new IssueGiftCardRequest(initialValue), ct);

    public Task<GiftCardResponse> SetGiftCardActiveAsync(Guid companyId, Guid giftCardId, bool active, CancellationToken ct = default)
        => PutAsync<SetGiftCardActiveRequest, GiftCardResponse>($"/api/companies/{companyId}/giftcards/{giftCardId}/active", new SetGiftCardActiveRequest(active), ct);

    public Task<LoyaltyAccountResponse> RedeemLoyaltyPointsAsync(Guid companyId, Guid customerId, int points, CancellationToken ct = default)
        => PostAsync<RedeemLoyaltyPointsRequest, LoyaltyAccountResponse>($"/api/companies/{companyId}/customers/{customerId}/loyalty/redeem", new RedeemLoyaltyPointsRequest(points), ct);

    public Task<PurchaseOrderDetailResponse> CreatePurchaseOrderAsync(Guid companyId, CreatePurchaseOrderRequest request, CancellationToken ct = default)
        => PostAsync<CreatePurchaseOrderRequest, PurchaseOrderDetailResponse>($"/api/companies/{companyId}/purchase-orders", request, ct);

    public Task<List<PurchaseOrderSummaryResponse>> GetPurchaseOrdersAsync(Guid companyId, PurchaseOrderStatus? status = null, Guid? supplierId = null, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/purchase-orders";
        var query = new List<string>();
        if (status is not null) query.Add($"status={(int)status}");
        if (supplierId is not null) query.Add($"supplierId={supplierId}");
        if (query.Count > 0) url += "?" + string.Join("&", query);
        return GetAsync<List<PurchaseOrderSummaryResponse>>(url, ct);
    }

    public Task<PurchaseOrderDetailResponse> GetPurchaseOrderDetailAsync(Guid companyId, Guid id, CancellationToken ct = default)
        => GetAsync<PurchaseOrderDetailResponse>($"/api/companies/{companyId}/purchase-orders/{id}", ct);

    public Task<PurchaseOrderDetailResponse> ReceivePurchaseOrderLineAsync(Guid companyId, Guid purchaseOrderId, Guid lineId, ReceivePurchaseOrderLineRequest request, CancellationToken ct = default)
        => PostAsync<ReceivePurchaseOrderLineRequest, PurchaseOrderDetailResponse>(
            $"/api/companies/{companyId}/purchase-orders/{purchaseOrderId}/lines/{lineId}/receive", request, ct);

    public Task<PurchaseOrderDetailResponse> CancelPurchaseOrderAsync(Guid companyId, Guid id, CancellationToken ct = default)
        => PostAsync<object?, PurchaseOrderDetailResponse>($"/api/companies/{companyId}/purchase-orders/{id}/cancel", null, ct);

    public Task<ShiftDetailResponse> OpenShiftAsync(Guid companyId, Guid locationId, decimal openingCashAmount, CancellationToken ct = default)
        => PostAsync<OpenShiftRequest, ShiftDetailResponse>(
            $"/api/companies/{companyId}/locations/{locationId}/shifts/open", new OpenShiftRequest(openingCashAmount), ct);

    public Task<ShiftDetailResponse?> GetCurrentShiftAsync(Guid companyId, Guid locationId, CancellationToken ct = default)
        => GetOrDefaultAsync<ShiftDetailResponse>($"/api/companies/{companyId}/locations/{locationId}/shifts/current", ct);

    public Task<ShiftDetailResponse> CloseShiftAsync(Guid companyId, Guid shiftId, decimal closingCashAmount, string? closingNotes, CancellationToken ct = default)
        => PostAsync<CloseShiftRequest, ShiftDetailResponse>(
            $"/api/companies/{companyId}/shifts/{shiftId}/close", new CloseShiftRequest(closingCashAmount, closingNotes), ct);

    public Task<ShiftHistoryPageResponse> GetShiftHistoryAsync(Guid companyId, int page, CancellationToken ct = default)
        => GetAsync<ShiftHistoryPageResponse>($"/api/companies/{companyId}/shifts?page={page}", ct);

    public Task<ProductCatalogPageResponse> GetProductCatalogAsync(Guid companyId, string? search, int page, ProductCatalogFilter? filter = null, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/products/catalog?page={page}";
        if (!string.IsNullOrWhiteSpace(search))
            url += $"&search={Uri.EscapeDataString(search)}";

        if (filter is not null)
        {
            foreach (var status in filter.StockStatuses ?? Enumerable.Empty<string>())
                url += $"&stockStatus={Uri.EscapeDataString(status)}";
            if (filter.FavoritesOnly) url += "&favoritesOnly=true";
            if (filter.ExpiringSoonOnly) url += "&expiringSoon=true";
            if (filter.ExpiredOnly) url += "&expired=true";
            if (filter.ArchivedOnly) url += "&archivedOnly=true";
        }

        return GetAsync<ProductCatalogPageResponse>(url, ct);
    }

    public Task<ProductDetailResponse> GetProductDetailAsync(Guid companyId, Guid productId, CancellationToken ct = default)
        => GetAsync<ProductDetailResponse>($"/api/companies/{companyId}/products/{productId}", ct);

    public Task<ProductDetailResponse> CreateProductAsync(Guid companyId, ProductRequest request, CancellationToken ct = default)
        => PostAsync<ProductRequest, ProductDetailResponse>($"/api/companies/{companyId}/products", request, ct);

    public Task<ProductDetailResponse> UpdateProductAsync(Guid companyId, Guid productId, ProductRequest request, CancellationToken ct = default)
        => PutAsync<ProductRequest, ProductDetailResponse>($"/api/companies/{companyId}/products/{productId}", request, ct);

    public Task DeleteProductAsync(Guid companyId, Guid productId, CancellationToken ct = default)
        => DeleteAsync($"/api/companies/{companyId}/products/{productId}", ct);

    public Task RestoreProductAsync(Guid companyId, Guid productId, CancellationToken ct = default)
        => SendCoreAsync(() => new HttpRequestMessage(HttpMethod.Post, $"/api/companies/{companyId}/products/{productId}/restore"), ct);

    public Task<List<string>> GetPackagingUnitNamesAsync(Guid companyId, CancellationToken ct = default)
        => GetAsync<List<string>>($"/api/companies/{companyId}/products/packaging-unit-names", ct);

    public Task<BatchResponse> ReceiveStockAsync(Guid companyId, Guid productId, ReceiveStockRequest request, CancellationToken ct = default)
        => PostAsync<ReceiveStockRequest, BatchResponse>($"/api/companies/{companyId}/products/{productId}/stock/receive", request, ct);

    public Task<BatchResponse> AdjustStockAsync(Guid companyId, Guid productId, AdjustStockRequest request, CancellationToken ct = default)
        => PostAsync<AdjustStockRequest, BatchResponse>($"/api/companies/{companyId}/products/{productId}/stock/adjust", request, ct);

    public Task<List<BatchResponse>> GetBatchesAsync(Guid companyId, Guid productId, CancellationToken ct = default)
        => GetAsync<List<BatchResponse>>($"/api/companies/{companyId}/products/{productId}/batches", ct);

    public Task<DashboardSummaryResponse> GetDashboardSummaryAsync(Guid companyId, CancellationToken ct = default)
        => GetAsync<DashboardSummaryResponse>($"/api/companies/{companyId}/dashboard/summary", ct);

    public Task<List<CategoryResponse>> GetCategoriesAsync(Guid companyId, string? search = null, CancellationToken ct = default)
        => GetAsync<List<CategoryResponse>>(
            $"/api/companies/{companyId}/categories" +
            (string.IsNullOrWhiteSpace(search) ? "" : $"?search={Uri.EscapeDataString(search)}"), ct);

    public Task<CategoryResponse> CreateCategoryAsync(Guid companyId, string name, CancellationToken ct = default)
        => PostAsync<CategoryRequest, CategoryResponse>($"/api/companies/{companyId}/categories", new CategoryRequest(name), ct);

    public Task<CategoryResponse> RenameCategoryAsync(Guid companyId, Guid categoryId, string name, CancellationToken ct = default)
        => PutAsync<CategoryRequest, CategoryResponse>($"/api/companies/{companyId}/categories/{categoryId}", new CategoryRequest(name), ct);

    public Task DeleteCategoryAsync(Guid companyId, Guid categoryId, CancellationToken ct = default)
        => DeleteAsync($"/api/companies/{companyId}/categories/{categoryId}", ct);

    public Task<SyncPushResponse> PushSyncAsync(Guid companyId, SyncPushRequest request, CancellationToken ct = default)
        => PostAsync<SyncPushRequest, SyncPushResponse>($"/api/companies/{companyId}/sync/push", request, ct);

    public Task<SyncPullResponse> PullSyncAsync(Guid companyId, Guid locationId, DateTime? since, CancellationToken ct = default)
    {
        var url = $"/api/companies/{companyId}/sync/pull?locationId={locationId}";
        if (since is not null) url += $"&since={since.Value:o}";
        return GetAsync<SyncPullResponse>(url, ct);
    }

    private Task<TResponse> PostAsync<TRequest, TResponse>(string url, TRequest body, CancellationToken ct, bool allowRefresh = true)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        }, ct, allowRefresh);

    private Task<TResponse> PutAsync<TRequest, TResponse>(string url, TRequest body, CancellationToken ct)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        }, ct);

    private Task<TResponse> GetAsync<TResponse>(string url, CancellationToken ct)
        => SendAsync<TResponse>(() => new HttpRequestMessage(HttpMethod.Get, url), ct);

    // Serializes concurrent refresh attempts (e.g. several pages' OnAppearing
    // firing near-simultaneously right as the JWT expires) so only the first
    // 401 actually calls /api/auth/refresh; the rest await that same call and
    // reuse its result instead of each burning (and rotating away) the one
    // stored refresh token from under each other.
    private Task<AuthResponse>? _pendingRefresh;

    // For lookups where "not found" is an expected, normal outcome (e.g. "no
    // shift is currently open") rather than an error — returns null on 404
    // instead of throwing, so callers don't need a try/catch just to check.
    private async Task<TResponse?> GetOrDefaultAsync<TResponse>(string url, CancellationToken ct) where TResponse : class
    {
        try
        {
            return await GetAsync<TResponse>(url, ct);
        }
        catch (PharmaStockApiException ex) when (ex.StatusCode == 404)
        {
            return null;
        }
    }

    private Task DeleteAsync(string url, CancellationToken ct)
        => SendCoreAsync(() => new HttpRequestMessage(HttpMethod.Delete, url), ct);

    private async Task<TResponse> SendAsync<TResponse>(Func<HttpRequestMessage> requestFactory, CancellationToken ct, bool allowRefresh = true)
    {
        var response = await SendCoreAsync(requestFactory, ct, allowRefresh);
        var result = await response.Content.ReadFromJsonAsync<TResponse>(JsonOptions, ct);
        return result ?? throw new PharmaStockApiException((int)response.StatusCode, "Réponse vide du serveur.");
    }

    private async Task<HttpResponseMessage> SendCoreAsync(Func<HttpRequestMessage> requestFactory, CancellationToken ct, bool allowRefresh = true)
    {
        HttpResponseMessage response;
        try
        {
            var request = requestFactory();
            if (_session.Token is { Length: > 0 } token)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            response = await _http.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new PharmaStockApiException(0, "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
        }

        // The expired-JWT path: silently exchange the refresh token for a new
        // JWT (Section 21.1) and replay the original request exactly once,
        // rather than surfacing a 401 toast and bouncing the cashier back to
        // the login screen mid-sale just because an hour of wall-clock time
        // passed while the app stayed open.
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized
            && allowRefresh && _session.RefreshToken is { Length: > 0 })
        {
            if (await TryRefreshAsync(ct))
            {
                var retryRequest = requestFactory();
                retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.Token);
                response = await _http.SendAsync(retryRequest, ct);
            }
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new PharmaStockApiException((int)response.StatusCode, ExtractMessage(errorBody));
        }

        return response;
    }

    private async Task<bool> TryRefreshAsync(CancellationToken ct)
    {
        try
        {
            var refresh = _pendingRefresh ??= RefreshSessionAsync(ct);
            var auth = await refresh;
            _session.Save(auth);
            return true;
        }
        catch (PharmaStockApiException)
        {
            // Refresh token itself is dead/revoked/expired — nothing left to
            // do but let the original 401 surface, which every page already
            // treats as "session expired" and routes back to Login.
            return false;
        }
        finally
        {
            _pendingRefresh = null;
        }
    }

    private static string ExtractMessage(string errorJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(errorJson);
            if (doc.RootElement.TryGetProperty("message", out var msg))
                return msg.GetString() ?? errorJson;
        }
        catch (JsonException)
        {
            // Not a JSON error body (e.g. a raw 401/403 with no content) — fall through.
        }
        return string.IsNullOrWhiteSpace(errorJson) ? "Échec de la requête." : errorJson;
    }
}
