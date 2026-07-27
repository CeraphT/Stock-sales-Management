using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal picker listing held (parked) sales at the
/// current location (Section 18.1). Resuming a sale is PosPage's job — it
/// fetches the full line detail via GetSaleDetailAsync and repopulates the
/// cart itself; this page only returns which sale was picked (or null if
/// the cashier cancelled, or just discarded one or more via the inline 🗑
/// without ever picking anything).</summary>
public partial class HeldSalesPage : ContentPage
{
    private readonly LocalSalesService _localSales;
    private readonly LocalCatalogQueryService _localCatalog;
    private readonly SessionService _session;
    private TaskCompletionSource<Guid?>? _completionSource;
    private string? _currency;

    public HeldSalesPage(LocalSalesService localSales, LocalCatalogQueryService localCatalog, SessionService session)
    {
        InitializeComponent();
        _localSales = localSales;
        _localCatalog = localCatalog;
        _session = session;
    }

    public Task<Guid?> PickAsync()
    {
        _completionSource = new TaskCompletionSource<Guid?>();
        return _completionSource.Task;
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

    private async Task LoadAsync()
    {
        HeldSalesView.ItemsSource = null;
        EmptyLabel.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            var locationId = _session.LocationId;
            if (locationId is null) return;

            if (_currency is null)
            {
                var company = await _localCatalog.GetCompanyAsync(companyId);
                _currency = company.Currency;
            }

            var sales = await _localSales.GetHeldSalesAsync(companyId, locationId.Value);
            var rows = sales.Select(s => new HeldSaleRow(s, _currency)).ToList();
            HeldSalesView.ItemsSource = rows;
            EmptyLabel.IsVisible = rows.Count == 0;
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private async void OnHeldSaleSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as HeldSaleRow;
        HeldSalesView.SelectedItem = null;
        if (row is null) return;

        await CloseAsync(row.Id);
    }

    private async void OnDeleteHeldSaleClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not HeldSaleRow row) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("HeldSales_DeleteTitle"),
            LocalizationService.Translate("HeldSales_DeleteMessage"),
            LocalizationService.Translate("HeldSales_Delete"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _localSales.DeleteHeldSaleAsync(companyId, row.Id);
            await LoadAsync();
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

    private async Task CloseAsync(Guid? saleId)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(saleId);
        }
    }

    private sealed class HeldSaleRow
    {
        public Guid Id { get; }
        public string TimeText { get; }
        public string SubtitleText { get; }

        public HeldSaleRow(HeldSaleSummaryResponse s, string? currency)
        {
            Id = s.Id;
            TimeText = s.Timestamp.ToLocalTime().ToString("dd/MM HH:mm", CultureInfo.InvariantCulture);
            SubtitleText = LocalizationService.Translate(
                "HeldSales_RowSubtitle", s.CashierName, s.ItemCount, MoneyFormatter.Format(s.Total, currency));
        }
    }
}
