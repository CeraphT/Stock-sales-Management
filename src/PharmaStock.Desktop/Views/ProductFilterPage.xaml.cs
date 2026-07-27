using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal filter panel for ProductCatalogPage — same
/// modal/TaskCompletionSource pattern as CategoryPickerPage/
/// PackagingUnitPickerPage. "Réinitialiser" clears every checkbox and
/// resolves immediately with ProductCatalogFilter.None; "Appliquer" resolves
/// with whatever's currently checked.</summary>
public partial class ProductFilterPage : ContentPage
{
    private TaskCompletionSource<ProductCatalogFilter?>? _completionSource;
    private ProductCatalogFilter _current = ProductCatalogFilter.None;

    public ProductFilterPage()
    {
        InitializeComponent();
    }

    public Task<ProductCatalogFilter?> PickAsync(ProductCatalogFilter current)
    {
        _current = current;
        _completionSource = new TaskCompletionSource<ProductCatalogFilter?>();
        return _completionSource.Task;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        var statuses = _current.StockStatuses ?? new List<string>();
        InStockCheckBox.IsChecked = statuses.Contains("in_stock");
        LowStockCheckBox.IsChecked = statuses.Contains("low_stock");
        OutOfStockCheckBox.IsChecked = statuses.Contains("out_of_stock");
        FavoritesOnlyCheckBox.IsChecked = _current.FavoritesOnly;
        ExpiringSoonCheckBox.IsChecked = _current.ExpiringSoonOnly;
        ExpiredCheckBox.IsChecked = _current.ExpiredOnly;
        ArchivedOnlyCheckBox.IsChecked = _current.ArchivedOnly;
    }

    private async void OnApplyClicked(object? sender, EventArgs e)
    {
        var statuses = new List<string>();
        if (InStockCheckBox.IsChecked) statuses.Add("in_stock");
        if (LowStockCheckBox.IsChecked) statuses.Add("low_stock");
        if (OutOfStockCheckBox.IsChecked) statuses.Add("out_of_stock");

        var filter = new ProductCatalogFilter(
            statuses.Count > 0 ? statuses : null,
            FavoritesOnlyCheckBox.IsChecked,
            ExpiringSoonCheckBox.IsChecked,
            ExpiredCheckBox.IsChecked,
            ArchivedOnlyCheckBox.IsChecked);

        await CloseAsync(filter);
    }

    private async void OnResetClicked(object? sender, EventArgs e) => await CloseAsync(ProductCatalogFilter.None);

    private async Task CloseAsync(ProductCatalogFilter? filter)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(filter);
        }
    }
}
