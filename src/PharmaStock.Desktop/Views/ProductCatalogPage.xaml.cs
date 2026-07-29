using System.Collections.ObjectModel;
using System.Globalization;
using PharmaStock.Desktop.Controls;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class ProductCatalogPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ProductFilterPage _filterPage;
    private readonly ObservableCollection<ProductRow> _products = new();

    private CancellationTokenSource? _searchDebounceCts;
    private string? _currentSearch;
    private ProductCatalogFilter _currentFilter = ProductCatalogFilter.None;
    private int _currentPage = 1;
    private bool _loading;
    private string? _currency;

    public ProductCatalogPage(PharmaStockApiClient api, SessionService session, ProductFilterPage filterPage, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _filterPage = filterPage;
        this.AttachStandardHeader(themeService, session);
        ProductsView.ItemsSource = _products;
    }

    private async void OnFilterClicked(object? sender, EventArgs e)
    {
        try
        {
            var pickTask = _filterPage.PickAsync(_currentFilter);
            await Navigation.PushModalAsync(_filterPage);
            var result = await pickTask;
            if (result is null) return;

            _currentFilter = result;
            FilterButton.Variant = _currentFilter.IsActive ? IconButtonVariant.Primary : IconButtonVariant.Secondary;
            await LoadFirstPageAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadFirstPageAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }


    private async void OnNewProductClicked(object? sender, EventArgs e)
    {
        try
        {
            await Shell.Current.GoToAsync(nameof(ProductEditPage));
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnProductSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as ProductRow;
        ProductsView.SelectedItem = null;
        if (row is null) return;

        try
        {
            await Shell.Current.GoToAsync($"{nameof(ProductEditPage)}?productId={row.Id}");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnSearchTextChanged(object? sender, TextChangedEventArgs e)
    {
        _searchDebounceCts?.Cancel();
        var cts = new CancellationTokenSource();
        _searchDebounceCts = cts;

        try
        {
            await Task.Delay(350, cts.Token);
            if (cts.IsCancellationRequested) return;
            _currentSearch = e.NewTextValue;
            await LoadFirstPageAsync(cts.Token);
        }
        catch (TaskCanceledException)
        {
            // Superseded by a newer keystroke — ignore.
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnLoadMoreClicked(object? sender, EventArgs e)
    {
        try
        {
            await LoadPageAsync(_currentPage + 1, append: true);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private Task LoadFirstPageAsync(CancellationToken ct = default) => LoadPageAsync(1, append: false, ct);

    private async Task LoadPageAsync(int page, bool append, CancellationToken ct = default)
    {
        if (_loading) return;
        _loading = true;
        LoadMoreButton.IsEnabled = false;

        // A fresh (non-append) load replaces whatever's on screen — clear it
        // immediately rather than waiting for the response, so the spinner's
        // "no data visible yet" state is true from the very first frame
        // instead of only once the network round-trip finishes.
        if (!append)
        {
            _products.Clear();
            EmptyLabel.IsVisible = false;
            LoadingSpinner.IsVisible = true;
            LoadingSpinner.IsRunning = true;
        }

        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
            }
            var result = await _api.GetProductCatalogAsync(companyId, _currentSearch, page, _currentFilter, ct);
            if (ct.IsCancellationRequested) return;

            foreach (var item in result.Items)
                _products.Add(new ProductRow(item, _currency));

            _currentPage = page;
            LoadMoreButton.IsVisible = result.HasMore;
            EmptyLabel.IsVisible = _products.Count == 0;
        }
        finally
        {
            _loading = false;
            LoadMoreButton.IsEnabled = true;
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private sealed class ProductRow
    {
        public Guid Id { get; }
        public string Name { get; }
        public string PriceText { get; }
        public string SubtitleText { get; }
        public bool IsFavorite { get; }
        public string StatusText { get; }
        public Color StatusColor { get; }
        public bool HasExpiryBadge { get; }
        public string ExpiryBadgeText { get; }
        public Color ExpiryBadgeColor { get; }

        public ProductRow(ProductCatalogItem item, string? currency)
        {
            Id = item.Id;
            Name = item.Name;
            PriceText = MoneyFormatter.Format(item.SalePrice, currency);
            SubtitleText = string.Join(" · ", new[] { item.CategoryName, item.Barcode }.Where(s => !string.IsNullOrWhiteSpace(s)));
            IsFavorite = item.IsFavorite;
            // An archived product's in/low/out-of-stock status is moot — it
            // can't be sold regardless — so the badge says that instead,
            // rather than showing a stock level that's no longer actionable.
            (StatusText, StatusColor) = item.IsActive
                ? item.StockStatus switch
                {
                    "out_of_stock" => (LocalizationService.Translate("Catalog_StatusOutOfStock"), (Color)Application.Current!.Resources["ErrorColor"]),
                    "low_stock" => (LocalizationService.Translate("StockStatus_LowStock"), (Color)Application.Current!.Resources["AccentAmber"]),
                    _ => (LocalizationService.Translate("StockStatus_InStock"), (Color)Application.Current!.Resources["SuccessColor"])
                }
                : (LocalizationService.Translate("Catalog_StatusArchived"), (Color)Application.Current!.Resources["Gray400"]);

            // Only surface a badge when it's actually actionable (expired or
            // expiring within the filter panel's own 30-day "soon" window) —
            // a far-future expiry isn't worth cluttering the card for.
            if (item.EarliestExpiry is { } expiry)
            {
                var daysUntil = (expiry.Date - DateTime.UtcNow.Date).Days;
                if (daysUntil < 0)
                {
                    HasExpiryBadge = true;
                    ExpiryBadgeText = LocalizationService.Translate("Catalog_ExpiredOn", expiry.ToString("dd/MM/yyyy"));
                    ExpiryBadgeColor = (Color)Application.Current!.Resources["ErrorColor"];
                }
                else if (daysUntil <= 30)
                {
                    HasExpiryBadge = true;
                    ExpiryBadgeText = LocalizationService.Translate("Catalog_ExpiresOn", expiry.ToString("dd/MM/yyyy"));
                    ExpiryBadgeColor = (Color)Application.Current!.Resources["Gray400"];
                }
                else
                {
                    HasExpiryBadge = false;
                    ExpiryBadgeText = string.Empty;
                    ExpiryBadgeColor = Colors.Transparent;
                }
            }
            else
            {
                HasExpiryBadge = false;
                ExpiryBadgeText = string.Empty;
                ExpiryBadgeColor = Colors.Transparent;
            }
        }
    }
}
