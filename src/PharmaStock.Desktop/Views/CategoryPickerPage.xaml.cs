using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal category picker, pushed by instance via
/// Navigation.PushModalAsync — same pattern as BarcodeScannerPage.ScanAsync().
/// Reloads the category list from the API every time PickAsync() is called,
/// since categories can change between opens (including via the "+" quick-add
/// on this very page).</summary>
public partial class CategoryPickerPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<CategoryResponse> _allCategories = new();
    private TaskCompletionSource<CategoryResponse?>? _completionSource;

    public CategoryPickerPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    public Task<CategoryResponse?> PickAsync()
    {
        _completionSource = new TaskCompletionSource<CategoryResponse?>();
        return _completionSource.Task;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SearchBarControl.Text = string.Empty;
        try
        {
            await LoadCategoriesAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadCategoriesAsync()
    {
        // This page/its CollectionView is reused across every PickAsync() open
        // (constructed once via DI) — without clearing first, a second open
        // shows the previous open's stale rows underneath the spinner until
        // the new response arrives.
        CategoriesView.ItemsSource = null;
        EmptyLabel.IsVisible = false;
        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allCategories = await _api.GetCategoriesAsync(companyId);
            ApplyFilter(SearchBarControl.Text);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void ApplyFilter(string? search)
    {
        var filtered = string.IsNullOrWhiteSpace(search)
            ? _allCategories
            : _allCategories.Where(c => c.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        CategoriesView.ItemsSource = filtered;
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnCategorySelected(object? sender, SelectionChangedEventArgs e)
    {
        var category = e.CurrentSelection.FirstOrDefault() as CategoryResponse;
        CategoriesView.SelectedItem = null;
        if (category is null) return;

        await CloseAsync(category);
    }

    private async void OnAddCategoryClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("Category_NewTitle"), LocalizationService.Translate("Category_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            var created = await _api.CreateCategoryAsync(companyId, name.Trim());
            await CloseAsync(created);
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnCancelClicked(object? sender, EventArgs e) => await CloseAsync(null);

    private async Task CloseAsync(CategoryResponse? category)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(category);
        }
    }

    private void SetBusy(bool busy)
    {
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
