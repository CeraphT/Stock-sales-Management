using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class CategoryManagementPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<CategoryResponse> _allCategories = new();

    public CategoryManagementPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
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
        EmptyLabel.IsVisible = false;
        CategoriesView.ItemsSource = null;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allCategories = await _api.GetCategoriesAsync(companyId);
            ApplyFilter(SearchBarControl.Text);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
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


    private async void OnAddCategoryClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("Category_NewTitle"), LocalizationService.Translate("Category_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.CreateCategoryAsync(companyId, name.Trim());
            await LoadCategoriesAsync();
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

    private async void OnDeleteCategoryClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not CategoryResponse category) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("CategoryManagement_DeleteTitle"),
            LocalizationService.Translate("CategoryManagement_DeleteMessage", category.Name),
            LocalizationService.Translate("CategoryManagement_Delete"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.DeleteCategoryAsync(companyId, category.Id);
            await LoadCategoriesAsync();
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
}
