using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal supplier picker, pushed by instance via
/// Navigation.PushModalAsync — same pattern as CategoryPickerPage.</summary>
public partial class SupplierPickerPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<SupplierResponse> _allSuppliers = new();
    private TaskCompletionSource<SupplierResponse?>? _completionSource;

    public SupplierPickerPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    public Task<SupplierResponse?> PickAsync()
    {
        _completionSource = new TaskCompletionSource<SupplierResponse?>();
        return _completionSource.Task;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SearchBarControl.Text = string.Empty;
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
        SuppliersView.ItemsSource = null;
        EmptyLabel.IsVisible = false;
        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allSuppliers = await _api.GetSuppliersAsync(companyId);
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
            ? _allSuppliers
            : _allSuppliers.Where(s => s.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        SuppliersView.ItemsSource = filtered;
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnSupplierSelected(object? sender, SelectionChangedEventArgs e)
    {
        var supplier = e.CurrentSelection.FirstOrDefault() as SupplierResponse;
        SuppliersView.SelectedItem = null;
        if (supplier is null) return;

        await CloseAsync(supplier);
    }

    private async void OnAddSupplierClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("SupplierPicker_NewTitle"), LocalizationService.Translate("SupplierPicker_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            var created = await _api.CreateSupplierAsync(companyId, name.Trim());
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

    private async Task CloseAsync(SupplierResponse? supplier)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(supplier);
        }
    }

    private void SetBusy(bool busy)
    {
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
