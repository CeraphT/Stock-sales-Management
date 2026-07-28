using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal customer picker for PosPage, pushed by
/// instance via Navigation.PushModalAsync — same pattern as
/// SupplierPickerPage, except the list is read from the local sync-pulled
/// cache (LocalCatalogQueryService), not a live API call: unlike the
/// supplier picker (only ever used from purchase-order creation, a
/// management flow that already assumes connectivity), this one lives
/// inside POS, which must keep working with zero network. "Add new" still
/// requires connectivity, same as SupplierPickerPage — a brand-new walk-in
/// customer's profile is a rarer, less time-critical action than completing
/// the sale itself.</summary>
public partial class CustomerPickerPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly LocalCatalogQueryService _localCatalog;
    private readonly SessionService _session;
    private List<CustomerResponse> _allCustomers = new();
    private TaskCompletionSource<CustomerResponse?>? _completionSource;

    public CustomerPickerPage(PharmaStockApiClient api, LocalCatalogQueryService localCatalog, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _localCatalog = localCatalog;
        _session = session;
    }

    public Task<CustomerResponse?> PickAsync()
    {
        _completionSource = new TaskCompletionSource<CustomerResponse?>();
        return _completionSource.Task;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SearchBarControl.Text = string.Empty;
        try
        {
            await LoadCustomersAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadCustomersAsync()
    {
        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            // An empty search still needs to show existing customers (unlike
            // PosPage's product search, which only fires on non-empty text) —
            // a cashier picking a familiar customer should see the list
            // immediately without having to type a name first.
            _allCustomers = await _localCatalog.SearchCustomersAsync(companyId, string.Empty);
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
            ? _allCustomers
            : _allCustomers.Where(c => c.Name.Contains(search, StringComparison.OrdinalIgnoreCase)
                || (c.Phone?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)).ToList();

        CustomersView.ItemsSource = filtered.Select(c => new CustomerRow(c)).ToList();
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private async void OnSearchTextChanged(object? sender, TextChangedEventArgs e)
    {
        var term = e.NewTextValue?.Trim() ?? string.Empty;
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allCustomers = await _localCatalog.SearchCustomersAsync(companyId, term);
            ApplyFilter(term);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnCustomerSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as CustomerRow;
        CustomersView.SelectedItem = null;
        if (row is null) return;

        await CloseAsync(row.Customer);
    }

    private async void OnAddCustomerClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("CustomerPicker_NewTitle"), LocalizationService.Translate("CustomerPicker_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        var phone = await this.DisplayPromptAsync(LocalizationService.Translate("CustomerPicker_NewTitle"), LocalizationService.Translate("CustomerPicker_PhonePrompt"), keyboard: Keyboard.Telephone);

        try
        {
            var companyId = _session.CompanyId!.Value;
            var created = await _api.CreateCustomerAsync(companyId, name.Trim(), string.IsNullOrWhiteSpace(phone) ? null : phone.Trim());
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

    private async Task CloseAsync(CustomerResponse? customer)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(customer);
        }
    }

    private void SetBusy(bool busy)
    {
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }

    private sealed class CustomerRow
    {
        public CustomerResponse Customer { get; }
        public string Name => Customer.Name;
        public string SubtitleText { get; }
        public bool HasSubtitle => !string.IsNullOrWhiteSpace(SubtitleText);

        public CustomerRow(CustomerResponse customer)
        {
            Customer = customer;
            SubtitleText = customer.Phone ?? string.Empty;
        }
    }
}
