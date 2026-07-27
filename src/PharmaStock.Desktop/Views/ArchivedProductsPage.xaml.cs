using System.Collections.ObjectModel;
using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Dedicated "manage archives" screen, reachable from the side menu
/// rather than only via the catalog's filter panel — lists archived products
/// with an inline restore action per row, since re-activating a product is
/// the main thing this screen exists for.</summary>
public partial class ArchivedProductsPage : ContentPage
{
    private static readonly ProductCatalogFilter ArchivedOnlyFilter = new(ArchivedOnly: true);

    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ObservableCollection<ProductRow> _products = new();

    private int _currentPage = 1;
    private bool _loading;
    private string? _currency;

    public ArchivedProductsPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
        ProductsView.ItemsSource = _products;
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

    private async void OnRestoreClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not ProductRow row) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.RestoreProductAsync(companyId, row.Id);
            // Optimistic removal rather than a full reload — restoring only
            // ever affects the tapped row, and this list is scoped to
            // archived products only, so a restored item never belongs here.
            _products.Remove(row);
            EmptyLabel.IsVisible = _products.Count == 0;
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

    private Task LoadFirstPageAsync() => LoadPageAsync(1, append: false);

    private async Task LoadPageAsync(int page, bool append)
    {
        if (_loading) return;
        _loading = true;
        LoadMoreButton.IsEnabled = false;

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
            var result = await _api.GetProductCatalogAsync(companyId, search: null, page, ArchivedOnlyFilter);

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

        public ProductRow(ProductCatalogItem item, string? currency)
        {
            Id = item.Id;
            Name = item.Name;
            PriceText = MoneyFormatter.Format(item.SalePrice, currency);
            SubtitleText = string.Join(" · ", new[] { item.CategoryName, item.Barcode }.Where(s => !string.IsNullOrWhiteSpace(s)));
        }
    }
}
