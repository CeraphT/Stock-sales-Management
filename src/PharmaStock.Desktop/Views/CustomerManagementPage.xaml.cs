using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Client management: list/create customers, and (Section 21.3)
/// convert a customer's earned loyalty points into spendable store credit.
/// No delete — unlike Supplier, a Customer accumulates real financial
/// history (CreditBalance, LoyaltyAccount) that must never be silently
/// discarded.</summary>
public partial class CustomerManagementPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<CustomerResponse> _allCustomers = new();

    public CustomerManagementPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
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
            await LoadCustomersAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadCustomersAsync()
    {
        EmptyLabel.IsVisible = false;
        CustomersView.ItemsSource = null;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allCustomers = await _api.GetCustomersAsync(companyId);
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
            ? _allCustomers
            : _allCustomers.Where(c => c.Name.Contains(search, StringComparison.OrdinalIgnoreCase)
                || (c.Phone?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)).ToList();

        CustomersView.ItemsSource = filtered.Select(c => new CustomerRow(c)).ToList();
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnAddCustomerClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("CustomerPicker_NewTitle"), LocalizationService.Translate("CustomerPicker_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        var phone = await this.DisplayPromptAsync(LocalizationService.Translate("CustomerPicker_NewTitle"), LocalizationService.Translate("CustomerPicker_PhonePrompt"), keyboard: Keyboard.Telephone);

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.CreateCustomerAsync(companyId, name.Trim(), string.IsNullOrWhiteSpace(phone) ? null : phone.Trim());
            await LoadCustomersAsync();
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

    private async void OnCustomerSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as CustomerRow;
        CustomersView.SelectedItem = null;
        if (row is null) return;

        if (row.Customer.LoyaltyPointsBalance <= 0)
        {
            await this.DisplayAlertAsync(row.Name, LocalizationService.Translate("CustomerManagement_NoPoints"), LocalizationService.Translate("Common_OK"));
            return;
        }

        var convert = LocalizationService.Translate("CustomerManagement_RedeemPoints");
        var choice = await this.DisplayActionSheetAsync(row.Name, LocalizationService.Translate("Common_Cancel"), null, convert);
        if (choice != convert) return;

        var pointsText = await this.DisplayPromptAsync(
            convert, LocalizationService.Translate("CustomerManagement_RedeemPointsPrompt", row.Customer.LoyaltyPointsBalance),
            keyboard: Keyboard.Numeric, initialValue: row.Customer.LoyaltyPointsBalance.ToString());
        if (!int.TryParse(pointsText, out var points) || points <= 0) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.RedeemLoyaltyPointsAsync(companyId, row.Customer.Id, points);
            ToastExtensions.ShowSuccess(this, LocalizationService.Translate("CustomerManagement_RedeemSuccess"));
            await LoadCustomersAsync();
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

    private sealed class CustomerRow
    {
        public CustomerResponse Customer { get; }
        public string Name => Customer.Name;
        public string SubtitleText { get; }
        public bool HasSubtitle => !string.IsNullOrWhiteSpace(SubtitleText);
        public string BalancesText { get; }

        public CustomerRow(CustomerResponse customer)
        {
            Customer = customer;
            SubtitleText = customer.Phone ?? string.Empty;
            var parts = new List<string>();
            if (customer.CreditBalance > 0)
                parts.Add(LocalizationService.Translate("CustomerManagement_CreditLine", customer.CreditBalance));
            if (customer.LoyaltyPointsBalance > 0)
                parts.Add(LocalizationService.Translate("CustomerManagement_PointsLine", customer.LoyaltyPointsBalance));
            if (customer.LoyaltyStoreCreditBalance > 0)
                parts.Add(LocalizationService.Translate("CustomerManagement_StoreCreditLine", customer.LoyaltyStoreCreditBalance));
            BalancesText = parts.Count > 0 ? string.Join(" · ", parts) : LocalizationService.Translate("CustomerManagement_NoBalance");
        }
    }
}
