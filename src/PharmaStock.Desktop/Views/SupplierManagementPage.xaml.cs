using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class SupplierManagementPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly SupplierEditPage _editPage;
    private List<SupplierResponse> _allSuppliers = new();

    public SupplierManagementPage(PharmaStockApiClient api, SessionService session, SupplierEditPage editPage, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _editPage = editPage;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadSuppliersAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadSuppliersAsync()
    {
        EmptyLabel.IsVisible = false;
        SuppliersView.ItemsSource = null;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allSuppliers = await _api.GetSuppliersAsync(companyId);
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
            ? _allSuppliers
            : _allSuppliers.Where(s => s.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        SuppliersView.ItemsSource = filtered.Select(s => new SupplierRow(s)).ToList();
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnAddSupplierClicked(object? sender, EventArgs e)
    {
        try
        {
            var editTask = _editPage.EditAsync(null);
            await Navigation.PushModalAsync(_editPage);
            var saved = await editTask;
            if (saved)
                await LoadSuppliersAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnSupplierSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as SupplierRow;
        SuppliersView.SelectedItem = null;
        if (row is null) return;

        try
        {
            var editTask = _editPage.EditAsync(row.Supplier);
            await Navigation.PushModalAsync(_editPage);
            var saved = await editTask;
            if (saved)
                await LoadSuppliersAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnDeleteSupplierClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not SupplierRow row) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("SupplierManagement_DeleteTitle"),
            LocalizationService.Translate("SupplierManagement_DeleteMessage", row.Name),
            LocalizationService.Translate("SupplierManagement_Delete"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.DeleteSupplierAsync(companyId, row.Supplier.Id);
            await LoadSuppliersAsync();
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

    private sealed class SupplierRow
    {
        public SupplierResponse Supplier { get; }
        public string Name => Supplier.Name;
        public string SubtitleText { get; }
        public bool HasSubtitle => !string.IsNullOrWhiteSpace(SubtitleText);

        public SupplierRow(SupplierResponse supplier)
        {
            Supplier = supplier;
            SubtitleText = string.Join(" · ", new[] { supplier.ContactPhone, supplier.ContactEmail }.Where(s => !string.IsNullOrWhiteSpace(s)));
        }
    }
}
