using System.Collections.ObjectModel;
using System.Globalization;
using PharmaStock.Desktop.Services;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Views;

public partial class PurchaseOrdersListPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly SupplierPickerPage _supplierPicker;
    private readonly ObservableCollection<OrderRow> _rows = new();
    private readonly List<Button> _statusChips;

    private PurchaseOrderStatus? _statusFilter;
    private Guid? _supplierFilterId;
    private string? _currency;

    public PurchaseOrdersListPage(PharmaStockApiClient api, SessionService session, SupplierPickerPage supplierPicker, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _supplierPicker = supplierPicker;
        this.AttachStandardHeader(themeService, session);
        OrdersView.ItemsSource = _rows;
        _statusChips = new List<Button> { AllChip, PendingChip, PartialChip, ReceivedChip, CancelledChip };
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnAllClicked(object? sender, EventArgs e) => await ApplyFilterAsync(AllChip, null);
    private async void OnPendingClicked(object? sender, EventArgs e) => await ApplyFilterAsync(PendingChip, PurchaseOrderStatus.Pending);
    private async void OnPartialClicked(object? sender, EventArgs e) => await ApplyFilterAsync(PartialChip, PurchaseOrderStatus.PartiallyReceived);
    private async void OnReceivedClicked(object? sender, EventArgs e) => await ApplyFilterAsync(ReceivedChip, PurchaseOrderStatus.Received);
    private async void OnCancelledClicked(object? sender, EventArgs e) => await ApplyFilterAsync(CancelledChip, PurchaseOrderStatus.Cancelled);

    private async Task ApplyFilterAsync(Button selected, PurchaseOrderStatus? status)
    {
        foreach (var chip in _statusChips)
            chip.Style = (Style)Application.Current!.Resources[chip == selected ? "ChipButtonSelected" : "ChipButtonUnselected"];

        _statusFilter = status;
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadAsync()
    {
        _rows.Clear();
        EmptyLabel.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
            }
            var orders = await _api.GetPurchaseOrdersAsync(companyId, _statusFilter, _supplierFilterId);
            foreach (var order in orders)
                _rows.Add(new OrderRow(order, _currency));
            EmptyLabel.IsVisible = _rows.Count == 0;
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private async void OnSupplierFilterClicked(object? sender, EventArgs e)
    {
        try
        {
            var pickTask = _supplierPicker.PickAsync();
            await Navigation.PushModalAsync(_supplierPicker);
            var supplier = await pickTask;
            if (supplier is null) return;

            _supplierFilterId = supplier.Id;
            SupplierFilterButton.Text = supplier.Name;
            ClearSupplierFilterButton.IsVisible = true;
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnClearSupplierFilterClicked(object? sender, EventArgs e)
    {
        _supplierFilterId = null;
        SupplierFilterButton.Text = LocalizationService.Translate("PurchaseOrder_SupplierFilterAll");
        ClearSupplierFilterButton.IsVisible = false;
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnNewClicked(object? sender, EventArgs e)
    {
        try
        {
            await Shell.Current.GoToAsync(nameof(PurchaseOrderCreatePage));
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnOrderSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as OrderRow;
        OrdersView.SelectedItem = null;
        if (row is null) return;

        try
        {
            await Shell.Current.GoToAsync($"{nameof(PurchaseOrderDetailPage)}?purchaseOrderId={row.Id}");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private sealed class OrderRow
    {
        public Guid Id { get; }
        public string SupplierName { get; }
        public string StatusText { get; }
        public string SubtitleText { get; }

        public OrderRow(PurchaseOrderSummaryResponse o, string? currency)
        {
            Id = o.Id;
            SupplierName = o.SupplierName;
            StatusText = LocalizationService.TranslatePurchaseOrderStatus(o.Status);
            var date = o.CreatedAt.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            SubtitleText = LocalizationService.Translate(
                "PurchaseOrder_RowSubtitle", date, o.LocationName, o.LineCount, MoneyFormatter.Format(o.TotalCost, currency));
        }
    }
}
